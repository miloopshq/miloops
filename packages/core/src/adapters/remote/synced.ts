import type { TrackerAdapter } from '../../adapter';
import { Emitter } from '../../emitter';
import { buildDecision, decisionNumber } from '../../decisions';
import { parseMapBody, serializeMapBody } from '../../mapBody';
import { OperationError } from '../../operations';
import type { DecisionInput, DecisionRecord, MapDoc, MapMode, MapSections, MapSnapshot, MapSummary, Ticket, TicketType, TrackerEvent } from '../../types';
import { TrackerError, isTransient, type RateInfo } from './http';

export type SyncState = 'connecting' | 'online' | 'offline' | 'rate-limited' | 'auth-error';

/** Connection health of a remote tracker, shown next to the connector in Settings. */
export interface SyncStatus {
  state: SyncState;
  /** Writes made while offline or rate limited, sent in order once the tracker answers again. */
  queued: number;
  lastSyncAt?: number;
  /** While rate limited: when requests resume (epoch ms). */
  resetAt?: number;
  /** Last failure, cleared on the next success. */
  error?: string;
  rate?: RateInfo;
}

export interface SyncOptions {
  /** Poll interval while someone is subscribed. */
  pollMs?: number;
  maxBackoffMs?: number;
  /** How long a cached mission is trusted when nothing is polling (e.g. an agent-only server). */
  ttlMs?: number;
  now?: () => number;
  /** No timers: the caller drives polling and queue flushes with `tick()` (tests). */
  manual?: boolean;
  /** Keeps queued writes across restarts; without it they live in memory only. */
  outbox?: OutboxStore;
}

/** A write that can wait for the tracker, as plain data so a later run can send it. */
export type QueuedChange =
  | { kind: 'mode'; mode: MapMode }
  | { kind: 'sections'; sections: MapSections }
  | { kind: 'blocking'; blockerId: string; blockedId: string }
  | { kind: 'claim'; ticketId: string; assignee?: string }
  | { kind: 'comment'; ticketId: string; author: string; body: string }
  | { kind: 'close'; ticketId: string; reason: 'completed' | 'not_planned' }
  | { kind: 'decision'; decision: DecisionRecord }
  | { kind: 'supersede'; decisionId: string; supersededBy: string };

export interface QueuedWrite {
  /** Unique per write; comments carry it in the tracker, so a replay can tell they already landed. */
  id: string;
  mapId: string;
  label: string;
  at: number;
  change: QueuedChange;
  /** May have reached the tracker already (the connection dropped mid-request, or a run exited mid-send): check before sending. */
  verify?: boolean;
}

/** Where queued writes survive a restart or crash (outboxFile.ts). */
export interface OutboxStore {
  /** Writes left unsent by earlier runs, oldest first; they now belong to this adapter. */
  load(): QueuedWrite[];
  /** The whole queue, after every change to it. */
  save(writes: QueuedWrite[]): void;
  /** Stop owning the queue; unsent writes wait for the next run. */
  release(): void;
}

type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EventInit = Without<TrackerEvent, 'at'>;

interface Entry {
  snap: MapSnapshot;
  decisions: DecisionRecord[];
  at: number;
}

/** Changes that would duplicate if sent twice; the rest set state, so sending them again is harmless. */
const CHECKED = new Set<QueuedChange['kind']>(['comment', 'decision', 'blocking']);

/** Map sections exactly as they read back from the tracker, so cache and remote compare equal. */
const roundtrip = (s: MapSections) => parseMapBody(serializeMapBody(s));

function fingerprint(e: Entry) {
  const { map, tickets } = e.snap;
  return JSON.stringify([
    map.title,
    map.mode,
    roundtrip(map.sections),
    [...tickets]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((t) => [t.id, t.title, t.type, !!t.hitl, t.state, t.closeReason ?? '', t.assignee ?? '', [...t.blockedBy].sort(), t.body.trim(), t.comments.map((c) => [c.author, c.body.trim()])]),
    e.decisions.map((d) => `${d.id}>${d.supersededBy ?? ''}`).sort(),
  ]);
}

/**
 * Shared engine of the GitHub and Linear adapters. It implements the whole
 * TrackerAdapter contract on top of a handful of remote primitives:
 *
 * - write-through cache: every write updates the cached mission, so the UI's
 *   frequent `loadMap` calls cost no requests;
 * - writes are serialized per mission, in call order;
 * - writes that need no answer from the tracker (comments, claims, closes,
 *   blocking, mission edits, decisions) are queued while offline or rate
 *   limited and sent in order when it answers again; creates fail fast;
 * - with an `outbox` store the queue survives an exit or crash and is replayed
 *   by the next run; writes that may already have landed are checked first;
 * - polling (while subscribed) picks up changes made in the tracker and emits
 *   `external.changed` only when the mission really differs from the cache.
 */
export abstract class SyncedAdapter implements TrackerAdapter {
  abstract readonly kind: 'github' | 'linear';
  abstract readonly label: string;
  abstract readonly location: string;

  protected abstract fetchMaps(): Promise<MapSummary[]>;
  protected abstract fetchMap(mapId: string): Promise<{ snap: MapSnapshot; decisions: DecisionRecord[] }>;
  /** Missions changed in the tracker since the last call; `'all'` when the mission list itself may have changed. */
  protected abstract changedSince(known: (issueRef: string) => string | undefined): Promise<string[] | 'all'>;
  protected abstract rate(): RateInfo | undefined;

  protected abstract remoteCreateMap(input: { title: string; sections: MapSections; mode: MapMode }): Promise<MapDoc>;
  protected abstract remoteCreateTicket(map: MapDoc, input: { title: string; type: TicketType; body: string; hitl?: boolean }): Promise<Ticket>;
  protected abstract remoteAddBlocking(map: MapDoc, blocker: Ticket, blocked: Ticket): Promise<void>;
  /** Persist the claim (`t.assignee`) of an already-updated ticket. */
  protected abstract remoteSetClaim(map: MapDoc, t: Ticket): Promise<void>;
  /** `writeId` must be readable back as the comment's `writeId`. */
  protected abstract remoteComment(map: MapDoc, t: Ticket, author: string, body: string, writeId: string): Promise<void>;
  protected abstract remoteClose(map: MapDoc, t: Ticket, reason: 'completed' | 'not_planned'): Promise<void>;
  protected abstract remoteUpdateMap(map: MapDoc): Promise<void>;
  protected abstract remoteSetMode(map: MapDoc, mode: MapMode): Promise<void>;
  /** Post a decision record on its ticket, or on the mission when it has none. */
  protected abstract remotePostDecision(map: MapDoc, d: DecisionRecord, ticket?: Ticket): Promise<void>;
  protected abstract remoteUpdateDecision(map: MapDoc, d: DecisionRecord): Promise<void>;

  private events = new Emitter<TrackerEvent>();
  private statusEvents = new Emitter<SyncStatus>();
  private current: SyncStatus = { state: 'connecting', queued: 0 };
  private maps?: { list: MapSummary[]; at: number };
  private entries = new Map<string, Entry>();
  private loading = new Map<string, Promise<Entry>>();
  private locks = new Map<string, Promise<unknown>>();
  private outbox: QueuedWrite[];
  private store?: OutboxStore;
  private subscribers = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private failures = 0;
  private lastDecision = 0;
  private writes = 0;
  private closed = false;
  protected readonly now: () => number;
  private pollMs: number;
  private maxBackoffMs: number;
  private ttlMs: number;
  private manual: boolean;

  constructor(opts: SyncOptions = {}) {
    this.manual = !!opts.manual;
    this.now = opts.now ?? Date.now;
    this.pollMs = opts.pollMs ?? 10_000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 120_000;
    this.ttlMs = opts.ttlMs ?? 15_000;
    this.store = opts.outbox;
    this.outbox = (this.store?.load() ?? []).map((w) => ({ ...w, verify: true }));
    this.current = { ...this.current, queued: this.outbox.length };
    this.schedule(0);
  }

  get status(): SyncStatus {
    return this.current;
  }

  onStatus(fn: (s: SyncStatus) => void) {
    return this.statusEvents.on(fn);
  }

  private setStatus(patch: Partial<SyncStatus>) {
    this.current = { ...this.current, ...patch, queued: this.outbox.length, rate: this.rate() ?? this.current.rate };
    this.statusEvents.emit(this.current);
  }

  private online() {
    if (this.current.state !== 'online' || this.current.error) this.setStatus({ state: 'online', error: undefined, resetAt: undefined, lastSyncAt: this.now() });
    else this.current = { ...this.current, lastSyncAt: this.now(), rate: this.rate() ?? this.current.rate };
  }

  private failed(err: unknown) {
    const e = err as TrackerError;
    if (e instanceof TrackerError && e.code === 'offline') this.setStatus({ state: 'offline', error: e.message });
    else if (e instanceof TrackerError && e.code === 'rate_limited') this.setStatus({ state: 'rate-limited', resetAt: e.resetAt, error: e.message });
    else if (e instanceof TrackerError && e.code === 'auth') this.setStatus({ state: 'auth-error', error: e.message });
    else this.setStatus({ error: String((err as Error)?.message ?? err) });
  }

  private emit(e: EventInit) {
    this.events.emit({ ...e, at: this.now() } as TrackerEvent);
  }

  /** Runs `fn` after every earlier write to the same mission. */
  private lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    this.locks.set(key, next);
    void next.finally(() => this.locks.get(key) === next && this.locks.delete(key)).catch(() => {});
    return next;
  }

  private polling() {
    return this.subscribers > 0 && !this.closed;
  }

  private fresh(at: number) {
    return this.polling() || this.now() - at < this.ttlMs;
  }

  /* ---------- reads ---------- */

  async listMaps(): Promise<MapSummary[]> {
    if (this.maps && this.fresh(this.maps.at)) return structuredClone(this.maps.list);
    try {
      const list = await this.fetchMaps();
      this.online();
      this.maps = { list, at: this.now() };
    } catch (err) {
      this.failed(err);
      if (!(this.maps && isTransient(err))) throw err;
    }
    return structuredClone(this.maps.list);
  }

  private async fetchEntry(mapId: string): Promise<Entry> {
    const inflight = this.loading.get(mapId);
    if (inflight) return inflight;
    const p = this.fetchMap(mapId)
      .then((r) => {
        this.online();
        return { ...r, at: this.now() };
      })
      .finally(() => this.loading.delete(mapId));
    this.loading.set(mapId, p);
    return p;
  }

  /** Remote state plus the queued writes not sent yet (after a restart there is no cache that has them). */
  private withQueued(mapId: string, remote: Entry): Entry {
    const queued = this.outbox.filter((w) => w.mapId === mapId);
    if (!queued.length) return remote;
    const e = structuredClone(remote);
    for (const w of queued) {
      try {
        this.apply(e, w);
      } catch {
        // its ticket is gone; flush() drops the write
      }
    }
    return e;
  }

  /** Cached mission; refetched when stale, served stale while the tracker is unreachable. */
  protected async entry(mapId: string): Promise<Entry> {
    const cached = this.entries.get(mapId);
    if (cached && (this.fresh(cached.at) || this.outbox.length)) return cached;
    try {
      const e = this.withQueued(mapId, await this.fetchEntry(mapId));
      this.entries.set(mapId, e);
      return e;
    } catch (err) {
      this.failed(err);
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

  private ticketOf(e: Entry, id: string) {
    const t = e.snap.tickets.find((x) => x.id === id);
    if (!t) throw new OperationError(`ticket ${id} not found in mission ${e.snap.map.key}`);
    return t;
  }

  /* ---------- writes ---------- */

  /** Applies a queueable write to a cached (or freshly fetched) mission. Safe to repeat. */
  private apply(e: Entry, w: QueuedWrite) {
    const c = w.change;
    switch (c.kind) {
      case 'mode':
        e.snap.map.mode = c.mode;
        break;
      case 'sections':
        e.snap.map.sections = c.sections;
        break;
      case 'blocking': {
        const t = this.ticketOf(e, c.blockedId);
        if (!t.blockedBy.includes(c.blockerId)) this.touch(t, { blockedBy: [...t.blockedBy, c.blockerId] });
        break;
      }
      case 'claim':
        this.touch(this.ticketOf(e, c.ticketId), { assignee: c.assignee });
        break;
      case 'comment': {
        const t = this.ticketOf(e, c.ticketId);
        if (!t.comments.some((x) => x.writeId === w.id)) this.touch(t, { comments: [...t.comments, { id: `local-${w.id}`, author: c.author, body: c.body.trim(), createdAt: w.at, writeId: w.id }] });
        break;
      }
      case 'close':
        this.touch(this.ticketOf(e, c.ticketId), { state: 'closed', closeReason: c.reason, closedAt: w.at });
        break;
      case 'decision':
        if (!e.decisions.some((d) => d.id === c.decision.id)) e.decisions.push(c.decision);
        break;
      case 'supersede':
        e.decisions = e.decisions.map((d) => (d.id === c.decisionId ? { ...d, supersededBy: c.supersededBy } : d));
        break;
    }
  }

  /** Sends a queueable write, reading tickets and decisions from `e` (the mission before the write is applied). */
  private send(e: Entry, w: QueuedWrite): Promise<unknown> {
    const c = w.change;
    const map = e.snap.map;
    switch (c.kind) {
      case 'mode':
        return this.remoteSetMode(map, c.mode);
      case 'sections':
        return this.remoteUpdateMap({ ...map, sections: c.sections });
      case 'blocking':
        return this.remoteAddBlocking(map, this.ticketOf(e, c.blockerId), this.ticketOf(e, c.blockedId));
      case 'claim':
        return this.remoteSetClaim(map, { ...this.ticketOf(e, c.ticketId), assignee: c.assignee });
      case 'comment':
        return this.remoteComment(map, this.ticketOf(e, c.ticketId), c.author, c.body, w.id);
      case 'close':
        return this.remoteClose(map, this.ticketOf(e, c.ticketId), c.reason);
      case 'decision':
        return this.remotePostDecision(map, c.decision, c.decision.ticketId ? e.snap.tickets.find((t) => t.id === c.decision.ticketId) : undefined);
      case 'supersede': {
        const d = e.decisions.find((x) => x.id === c.decisionId);
        if (!d) throw new OperationError(`decision ${c.decisionId} not found in ${w.mapId}`);
        return this.remoteUpdateDecision(map, { ...d, supersededBy: c.supersededBy });
      }
    }
  }

  /** Whether the tracker (`remote`, uncached) already has a write of a kind that must not be sent twice. */
  private landed(remote: Entry, w: QueuedWrite) {
    const c = w.change;
    const ticket = (id: string) => remote.snap.tickets.find((t) => t.id === id);
    if (c.kind === 'comment') return !!ticket(c.ticketId)?.comments.some((x) => x.writeId === w.id);
    if (c.kind === 'blocking') return !!ticket(c.blockedId)?.blockedBy.includes(c.blockerId);
    if (c.kind === 'decision') return remote.decisions.some((d) => d.id === c.decision.id && d.decidedAt === c.decision.decidedAt && d.answer === c.decision.answer);
    return false;
  }

  /** Same inputs give the same id (recorded fixtures stay stable); the clock and a counter keep real writes apart. */
  private writeId(mapId: string, change: QueuedChange) {
    const s = `${mapId}\n${JSON.stringify(change)}\n${this.now()}\n${++this.writes}`;
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    return `${this.now().toString(36)}${(h >>> 0).toString(36)}`;
  }

  /**
   * Sends one queueable write and applies it to the cache. When the tracker is
   * offline or rate limited (or other writes are queued, to keep order) it is
   * applied to the cache now and queued, persisted when there is a store.
   */
  private async change(mapId: string, label: string, change: QueuedChange | ((e: Entry) => QueuedChange), event: EventInit) {
    await this.lock(mapId, async () => {
      const e = await this.entry(mapId);
      const c = typeof change === 'function' ? change(e) : change;
      const w: QueuedWrite = { id: this.writeId(mapId, c), mapId, label, at: this.now(), change: c };
      if (this.outbox.length) this.enqueue(w);
      else {
        try {
          await this.send(e, w);
          this.online();
        } catch (err) {
          this.failed(err);
          if (!isTransient(err)) throw err;
          this.enqueue({ ...w, verify: err.code === 'offline' || undefined });
        }
      }
      this.apply(e, w);
      e.at = this.now();
      e.snap.map.updatedAt = this.now();
      this.emit(event);
    });
  }

  private persist() {
    try {
      this.store?.save(this.outbox);
    } catch (err) {
      this.current = { ...this.current, error: `Could not save queued writes: ${(err as Error).message}` };
    }
  }

  private enqueue(w: QueuedWrite) {
    this.outbox.push(w);
    this.persist();
    this.setStatus({});
    this.schedule(this.current.state === 'rate-limited' && this.current.resetAt ? Math.max(1000, this.current.resetAt - this.now()) : Math.min(this.pollMs, 5000));
  }

  private touch(t: Ticket, patch: Partial<Ticket>): Ticket {
    Object.assign(t, patch, { updatedAt: this.now() });
    return t;
  }

  async createMap(input: { title: string; sections: MapSections; mode?: MapMode }): Promise<MapDoc> {
    let map: MapDoc;
    try {
      map = await this.remoteCreateMap({ title: input.title, sections: input.sections, mode: input.mode ?? 'plan+execute' });
      this.online();
    } catch (err) {
      this.failed(err);
      throw err;
    }
    map = { ...map, sections: roundtrip(map.sections) };
    this.entries.set(map.id, { snap: { map, tickets: [] }, decisions: [], at: this.now() });
    if (this.maps) this.maps.list.push({ id: map.id, key: map.key, title: map.title });
    this.emit({ kind: 'map.created', mapId: map.id });
    return structuredClone(map);
  }

  async setMapMode(mapId: string, mode: MapMode) {
    await this.change(mapId, `mode ${mode}`, { kind: 'mode', mode }, { kind: 'map.mode', mapId, mode });
  }

  async updateMapSections(mapId: string, patch: Partial<MapSections>) {
    await this.change(mapId, 'mission sections', (e) => ({ kind: 'sections', sections: roundtrip({ ...e.snap.map.sections, ...patch }) }), {
      kind: 'map.updated',
      mapId,
      section: Object.keys(patch)[0] as keyof MapSections,
    });
  }

  /** Creates need the tracker's answer (the new id), so they fail fast instead of queueing: never a duplicate issue. */
  async createTicket(mapId: string, input: { title: string; type: TicketType; body: string; hitl?: boolean }): Promise<Ticket> {
    const t = await this.lock(mapId, async () => {
      const e = await this.entry(mapId);
      let r: Ticket;
      try {
        r = await this.remoteCreateTicket(e.snap.map, input);
        this.online();
      } catch (err) {
        this.failed(err);
        throw err;
      }
      e.snap.tickets.push(r);
      e.at = this.now();
      e.snap.map.updatedAt = this.now();
      return r;
    });
    this.emit({ kind: 'ticket.created', mapId, ticketId: t.id });
    return structuredClone(t);
  }

  async addBlocking(mapId: string, blockerId: string, blockedId: string) {
    const e = await this.entry(mapId);
    const blocker = this.ticketOf(e, blockerId);
    const blocked = this.ticketOf(e, blockedId);
    const event: EventInit = { kind: 'edge.added', mapId, blockerId, blockedId };
    if (blocked.blockedBy.includes(blockerId)) return void this.emit(event);
    await this.change(mapId, `${blocker.key} blocks ${blocked.key}`, { kind: 'blocking', blockerId, blockedId }, event);
  }

  async assign(mapId: string, ticketId: string, assignee: string | null) {
    const t = this.ticketOf(await this.entry(mapId), ticketId);
    await this.change(
      mapId,
      `${assignee ? 'claim' : 'release'} ${t.key}`,
      { kind: 'claim', ticketId, assignee: assignee ?? undefined },
      assignee ? { kind: 'ticket.claimed', mapId, ticketId, assignee } : { kind: 'ticket.released', mapId, ticketId },
    );
  }

  async comment(mapId: string, ticketId: string, author: string, body: string) {
    const t = this.ticketOf(await this.entry(mapId), ticketId);
    await this.change(mapId, `comment on ${t.key}`, { kind: 'comment', ticketId, author, body }, { kind: 'ticket.commented', mapId, ticketId });
  }

  async close(mapId: string, ticketId: string, reason: 'completed' | 'not_planned') {
    const t = this.ticketOf(await this.entry(mapId), ticketId);
    await this.change(mapId, `close ${t.key}`, { kind: 'close', ticketId, reason }, { kind: 'ticket.closed', mapId, ticketId, reason });
  }

  /** `D-<n>` unique across every mission in the tracker, as with local markdown. */
  private async nextDecisionId() {
    const ids = await this.listMaps().then((l) => l.map((m) => m.id)).catch(() => [...this.entries.keys()]);
    const all = await Promise.all(ids.map((id) => this.entry(id).then((e) => e.decisions).catch(() => [] as DecisionRecord[])));
    this.lastDecision = Math.max(this.lastDecision, ...all.flat().map((d) => decisionNumber(d.id)));
    return `D-${++this.lastDecision}`;
  }

  async createDecision(mapId: string, input: DecisionInput): Promise<DecisionRecord> {
    await this.entry(mapId);
    const d = buildDecision(await this.nextDecisionId(), mapId, input);
    await this.change(mapId, `decision ${d.id}`, { kind: 'decision', decision: d }, { kind: 'decision.recorded', mapId, decisionId: d.id, ticketId: d.ticketId });
    return structuredClone(d);
  }

  async markSuperseded(mapId: string, decisionId: string, supersededBy: string) {
    const e = await this.entry(mapId);
    if (!e.decisions.some((x) => x.id === decisionId)) throw new OperationError(`decision ${decisionId} not found in ${mapId}`);
    await this.change(mapId, `supersede ${decisionId}`, { kind: 'supersede', decisionId, supersededBy }, { kind: 'decision.superseded', mapId, decisionId, supersededBy });
  }

  /* ---------- sync loop ---------- */

  subscribe(listener: (e: TrackerEvent) => void) {
    const off = this.events.on(listener);
    if (++this.subscribers === 1) this.schedule(0);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      off();
      if (--this.subscribers === 0 && !this.outbox.length) clearTimeout(this.timer);
    };
  }

  private schedule(ms: number) {
    clearTimeout(this.timer);
    if (this.manual || this.closed || (!this.polling() && !this.outbox.length)) return;
    this.timer = setTimeout(() => void this.tick(), ms);
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** One poll: send queued writes, then pick up tracker-side changes. Exposed for tests. */
  async tick() {
    try {
      await this.flush();
      if (this.polling()) await this.sync();
      this.failures = 0;
      this.schedule(this.pollMs);
    } catch (err) {
      this.failed(err);
      const e = err as TrackerError;
      const wait = e instanceof TrackerError && e.code === 'rate_limited' && e.resetAt ? e.resetAt - this.now() : this.pollMs * 2 ** ++this.failures;
      this.schedule(Math.max(1000, Math.min(this.maxBackoffMs, wait)));
    }
  }

  private async flush() {
    /** Uncached remote state read during this flush, to check writes that may have landed. */
    const remote = new Map<string, Entry>();
    const read = async (mapId: string) => {
      let r = remote.get(mapId);
      if (!r) {
        r = await this.fetchEntry(mapId);
        remote.set(mapId, r);
        if (!this.entries.has(mapId)) this.entries.set(mapId, this.withQueued(mapId, r));
      }
      return r;
    };
    while (this.outbox.length) {
      const w = this.outbox[0];
      try {
        const check = w.verify && CHECKED.has(w.change.kind);
        if (check || !this.entries.has(w.mapId)) await read(w.mapId);
        if (!(check && this.landed(remote.get(w.mapId)!, w))) await this.send(await this.entry(w.mapId), w);
      } catch (err) {
        if (isTransient(err)) {
          if (err.code === 'offline' && !w.verify) {
            w.verify = true;
            this.persist();
          }
          throw err;
        }
        // the tracker rejected it for good (deleted issue, revoked access): drop it rather than block the queue
        this.outbox.shift();
        this.persist();
        this.setStatus({ error: `Dropped queued write (${w.label}): ${(err as Error).message}` });
        continue;
      }
      this.outbox.shift();
      this.persist();
      this.online();
      this.setStatus({});
    }
  }

  private async sync() {
    const index = new Map<string, string>();
    for (const [mapId, e] of this.entries) {
      index.set(mapId, mapId);
      for (const t of e.snap.tickets) index.set(t.id, mapId);
    }
    const changed = await this.changedSince((ref) => index.get(ref));
    this.online();
    let ids = changed === 'all' ? [...this.entries.keys()] : [...new Set(changed)].filter((id) => this.entries.has(id));
    if (changed === 'all') {
      const prev = this.maps && new Set(this.maps.list.map((m) => m.id));
      const list = await this.fetchMaps();
      this.maps = { list, at: this.now() };
      if (prev && (list.some((m) => !prev.has(m.id)) || list.length !== prev.size)) this.emit({ kind: 'external.changed' });
      ids = ids.filter((id) => list.some((m) => m.id === id));
    }
    for (const id of ids) {
      if (this.outbox.length) break;
      const cached = this.entries.get(id)!;
      const fresh = await this.fetchEntry(id);
      await this.lock(id, async () => {
        const now = this.entries.get(id) ?? cached;
        if (fingerprint(fresh) === fingerprint(now)) return void (now.at = fresh.at);
        const seen = new Set(now.decisions.map((d) => d.id));
        this.entries.set(id, fresh);
        const added = fresh.decisions.filter((d) => !seen.has(d.id));
        for (const d of added) this.emit({ kind: 'decision.recorded', mapId: id, decisionId: d.id, ticketId: d.ticketId, external: true });
        this.emit({ kind: 'external.changed', mapId: id });
      });
    }
  }

  /** Stops polling. Unsent queued writes stay in the outbox store for the next run (lost without one). */
  dispose() {
    this.closed = true;
    clearTimeout(this.timer);
    this.store?.release();
  }
}
