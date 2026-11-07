import { Emitter } from '../../../lib/emitter';
import { KeyedLock } from '../../../lib/keyedLock';
import type { DecisionRecord, MapSnapshot, MapSummary, TrackerEvent } from '../../../model/types';
import { isTransient, type RateInfo } from '../http';
import { fingerprint } from './fingerprint';
import { Poller } from './poller';
import { applyWrite } from './queuedWrites';
import { SyncHealth } from './syncHealth';
import type { CacheEntry, EventInit, SyncOptions, SyncStatus } from './types';
import { WriteQueue } from './writeQueue';

/**
 * Read side of a synced adapter: the trail cache and the poll loop that
 * sends queued writes and picks up changes made in the tracker. Writes are
 * added by `SyncedWriter`, which also supplies `flush`.
 */
export abstract class SyncedStore {
  protected abstract fetchMaps(): Promise<MapSummary[]>;
  protected abstract fetchMap(mapId: string): Promise<{ snap: MapSnapshot; decisions: DecisionRecord[] }>;
  /** Trails changed in the tracker since the last call; `'all'` when the trail list itself may have changed. */
  protected abstract changedSince(known: (issueRef: string) => string | undefined): Promise<string[] | 'all'>;
  protected abstract rate(): RateInfo | undefined;
  /** Sends the queued writes, oldest first. */
  protected abstract flush(): Promise<void>;

  protected readonly now: () => number;
  protected readonly pollMs: number;
  protected readonly queue: WriteQueue;
  protected readonly health: SyncHealth;
  protected readonly poller: Poller;
  protected readonly locks = new KeyedLock();
  protected maps?: { list: MapSummary[]; at: number };
  protected entries = new Map<string, CacheEntry>();
  private events = new Emitter<TrackerEvent>();
  private loading = new Map<string, Promise<CacheEntry>>();
  private subscribers = 0;
  private closed = false;
  private ttlMs: number;

  constructor(opts: SyncOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.pollMs = opts.pollMs ?? 10_000;
    this.ttlMs = opts.ttlMs ?? 15_000;
    this.queue = new WriteQueue(opts.outbox, (error) => this.health.note(error));
    this.health = new SyncHealth({ now: this.now, queued: () => this.queue.length, rate: () => this.rate() });
    this.poller = new Poller({
      pollMs: this.pollMs,
      maxBackoffMs: opts.maxBackoffMs ?? 120_000,
      manual: !!opts.manual,
      now: this.now,
      idle: () => this.closed || (!this.polling() && !this.queue.length),
      run: () => this.poll(),
      failed: (err) => this.health.failed(err),
    });
    this.poller.schedule(0);
  }

  get status(): SyncStatus {
    return this.health.status;
  }

  onStatus(fn: (s: SyncStatus) => void) {
    return this.health.onStatus(fn);
  }

  protected emit(e: EventInit) {
    this.events.emit({ ...e, at: this.now() } as TrackerEvent);
  }

  private polling() {
    return this.subscribers > 0 && !this.closed;
  }

  private fresh(at: number) {
    return this.polling() || this.now() - at < this.ttlMs;
  }

  async listMaps(): Promise<MapSummary[]> {
    if (this.maps && this.fresh(this.maps.at)) return structuredClone(this.maps.list);
    try {
      const list = await this.fetchMaps();
      this.health.online();
      this.maps = { list, at: this.now() };
    } catch (err) {
      this.health.failed(err);
      if (!(this.maps && isTransient(err))) throw err;
    }
    return structuredClone(this.maps.list);
  }

  protected async fetchEntry(mapId: string): Promise<CacheEntry> {
    const inflight = this.loading.get(mapId);
    if (inflight) return inflight;
    const p = this.fetchMap(mapId)
      .then((r) => {
        this.health.online();
        return { ...r, at: this.now() };
      })
      .finally(() => this.loading.delete(mapId));
    this.loading.set(mapId, p);
    return p;
  }

  /** Remote state plus the queued writes not sent yet (after a restart there is no cache that has them). */
  protected withQueued(mapId: string, remote: CacheEntry): CacheEntry {
    const queued = this.queue.forMap(mapId);
    if (!queued.length) return remote;
    const e = structuredClone(remote);
    for (const w of queued) {
      try {
        applyWrite(e, w, this.now);
      } catch {
        // its ticket is gone; flush() drops the write
      }
    }
    return e;
  }

  /** Cached trail; refetched when stale, served stale while the tracker is unreachable. */
  protected async entry(mapId: string): Promise<CacheEntry> {
    const cached = this.entries.get(mapId);
    if (cached && (this.fresh(cached.at) || this.queue.length)) return cached;
    try {
      const e = this.withQueued(mapId, await this.fetchEntry(mapId));
      this.entries.set(mapId, e);
      return e;
    } catch (err) {
      this.health.failed(err);
      if (cached && isTransient(err)) return cached;
      throw err;
    }
  }

  async loadMap(mapId: string): Promise<MapSnapshot> {
    return structuredClone((await this.entry(mapId)).snap);
  }

  async listDecisions(mapId: string): Promise<DecisionRecord[]> {
    return structuredClone((await this.entry(mapId)).decisions);
  }

  subscribe(listener: (e: TrackerEvent) => void) {
    const off = this.events.on(listener);
    if (++this.subscribers === 1) this.poller.schedule(0);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      off();
      if (--this.subscribers === 0 && !this.queue.length) this.poller.stop();
    };
  }

  /** One poll: send queued writes, then pick up tracker-side changes. Exposed for tests. */
  tick() {
    return this.poller.tick();
  }

  private async poll() {
    await this.flush();
    if (this.polling()) await this.sync();
  }

  private async sync() {
    const index = new Map<string, string>();
    for (const [mapId, e] of this.entries) {
      index.set(mapId, mapId);
      for (const t of e.snap.tickets) index.set(t.id, mapId);
    }
    const changed = await this.changedSince((ref) => index.get(ref));
    this.health.online();
    let ids = changed === 'all' ? [...this.entries.keys()] : [...new Set(changed)].filter((id) => this.entries.has(id));
    if (changed === 'all') {
      const prev = this.maps && new Set(this.maps.list.map((m) => m.id));
      const list = await this.fetchMaps();
      this.maps = { list, at: this.now() };
      if (prev && (list.some((m) => !prev.has(m.id)) || list.length !== prev.size))
        this.emit({ kind: 'external.changed' });
      ids = ids.filter((id) => list.some((m) => m.id === id));
    }
    for (const id of ids) {
      if (this.queue.length) break;
      const cached = this.entries.get(id)!;
      const fresh = await this.fetchEntry(id);
      await this.locks.run(id, async () => {
        const now = this.entries.get(id) ?? cached;
        if (fingerprint(fresh) === fingerprint(now)) return void (now.at = fresh.at);
        const seen = new Set(now.decisions.map((d) => d.id));
        this.entries.set(id, fresh);
        const added = fresh.decisions.filter((d) => !seen.has(d.id));
        for (const d of added)
          this.emit({ kind: 'decision.recorded', mapId: id, decisionId: d.id, ticketId: d.ticketId, external: true });
        this.emit({ kind: 'external.changed', mapId: id });
      });
    }
  }

  /** Stops polling. Unsent queued writes stay in the outbox store for the next run (lost without one). */
  dispose() {
    this.closed = true;
    this.poller.stop();
    this.queue.release();
  }
}
