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
}

type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EventInit = Without<TrackerEvent, 'at'>;

interface Entry {
  snap: MapSnapshot;
  decisions: DecisionRecord[];
  at: number;
}

interface Pending {
  label: string;
  send: () => Promise<unknown>;
}

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
  protected abstract remoteComment(map: MapDoc, t: Ticket, author: string, body: string): Promise<void>;
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
  private outbox: Pending[] = [];
  private subscribers = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private failures = 0;
  private lastDecision = 0;
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

  /** Cached mission; refetched when stale, served stale while the tracker is unreachable. */
  protected async entry(mapId: string): Promise<Entry> {
    const cached = this.entries.get(mapId);
    if (cached && (this.fresh(cached.at) || this.outbox.length)) return cached;
    try {
      const e = await this.fetchEntry(mapId);
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

  /**
   * Sends one write and applies it to the cache. Queueable writes that hit an
   * offline or rate-limited tracker (or arrive while others are queued, to
   * keep order) are applied to the cache now and sent later.
   */
  private async write<R>(
    mapId: string,
    op: { label: string; prepare?: (e: Entry) => void; send: () => Promise<R>; apply?: (e: Entry, r?: R) => void; queue?: boolean; event?: EventInit },
  ): Promise<R | undefined> {
    return this.lock(mapId, async () => {
      const e = await this.entry(mapId);
      op.prepare?.(e);
      let result: R | undefined;
      if (op.queue && this.outbox.length) this.enqueue(op);
      else {
        try {
          result = await op.send();
          this.online();
        } catch (err) {
          this.failed(err);
          if (!(op.queue && isTransient(err))) throw err;
          this.enqueue(op);
        }
      }
      op.apply?.(e, result);
      e.at = this.now();
      e.snap.map.updatedAt = this.now();
      if (op.event) this.emit(op.event);
      return result;
    });
  }

  private enqueue(op: Pending) {
    this.outbox.push({ label: op.label, send: op.send });
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
    await this.write(mapId, {
      label: `mode ${mode}`,
      queue: true,
      send: async () => this.remoteSetMode((await this.entry(mapId)).snap.map, mode),
      apply: (e) => (e.snap.map.mode = mode),
      event: { kind: 'map.mode', mapId, mode },
    });
  }

  async updateMapSections(mapId: string, patch: Partial<MapSections>) {
    let next: MapDoc;
    await this.write(mapId, {
      label: 'mission sections',
      queue: true,
      prepare: (e) => (next = { ...e.snap.map, sections: roundtrip({ ...e.snap.map.sections, ...patch }) }),
      send: () => this.remoteUpdateMap(next),
      apply: (en) => (en.snap.map.sections = next.sections),
      event: { kind: 'map.updated', mapId, section: Object.keys(patch)[0] as keyof MapSections },
    });
  }

  async createTicket(mapId: string, input: { title: string; type: TicketType; body: string; hitl?: boolean }): Promise<Ticket> {
    const t = await this.write(mapId, {
      label: `create ${input.title}`,
      send: async () => this.remoteCreateTicket((await this.entry(mapId)).snap.map, input),
      apply: (e, r) => r && e.snap.tickets.push(r),
    });
    this.emit({ kind: 'ticket.created', mapId, ticketId: t!.id });
    return structuredClone(t!);
  }

  async addBlocking(mapId: string, blockerId: string, blockedId: string) {
    const e = await this.entry(mapId);
    const blocker = this.ticketOf(e, blockerId);
    const blocked = this.ticketOf(e, blockedId);
    const event: EventInit = { kind: 'edge.added', mapId, blockerId, blockedId };
    if (blocked.blockedBy.includes(blockerId)) return void this.emit(event);
    await this.write(mapId, {
      label: `${blocker.key} blocks ${blocked.key}`,
      queue: true,
      send: () => this.remoteAddBlocking(e.snap.map, blocker, blocked),
      apply: (en) => {
        const t = this.ticketOf(en, blockedId);
        if (!t.blockedBy.includes(blockerId)) this.touch(t, { blockedBy: [...t.blockedBy, blockerId] });
      },
      event,
    });
  }

  async assign(mapId: string, ticketId: string, assignee: string | null) {
    const e = await this.entry(mapId);
    let next = this.ticketOf(e, ticketId);
    await this.write(mapId, {
      label: `${assignee ? 'claim' : 'release'} ${next.key}`,
      queue: true,
      prepare: (en) => (next = { ...this.ticketOf(en, ticketId), assignee: assignee ?? undefined }),
      send: () => this.remoteSetClaim(e.snap.map, next),
      apply: (en) => this.touch(this.ticketOf(en, ticketId), { assignee: next.assignee }),
      event: assignee ? { kind: 'ticket.claimed', mapId, ticketId, assignee } : { kind: 'ticket.released', mapId, ticketId },
    });
  }

  async comment(mapId: string, ticketId: string, author: string, body: string) {
    const e = await this.entry(mapId);
    const t = this.ticketOf(e, ticketId);
    await this.write(mapId, {
      label: `comment on ${t.key}`,
      queue: true,
      send: () => this.remoteComment(e.snap.map, t, author, body),
      apply: (en) => {
        const x = this.ticketOf(en, ticketId);
        this.touch(x, { comments: [...x.comments, { id: `local-${this.now().toString(36)}-${x.comments.length}`, author, body: body.trim(), createdAt: this.now() }] });
      },
      event: { kind: 'ticket.commented', mapId, ticketId },
    });
  }

  async close(mapId: string, ticketId: string, reason: 'completed' | 'not_planned') {
    const e = await this.entry(mapId);
    const t = this.ticketOf(e, ticketId);
    await this.write(mapId, {
      label: `close ${t.key}`,
      queue: true,
      send: () => this.remoteClose(e.snap.map, t, reason),
      apply: (en) => this.touch(this.ticketOf(en, ticketId), { state: 'closed', closeReason: reason, closedAt: this.now() }),
      event: { kind: 'ticket.closed', mapId, ticketId, reason },
    });
  }

  /** `D-<n>` unique across every mission in the tracker, as with local markdown. */
  private async nextDecisionId() {
    const ids = await this.listMaps().then((l) => l.map((m) => m.id)).catch(() => [...this.entries.keys()]);
    const all = await Promise.all(ids.map((id) => this.entry(id).then((e) => e.decisions).catch(() => [] as DecisionRecord[])));
    this.lastDecision = Math.max(this.lastDecision, ...all.flat().map((d) => decisionNumber(d.id)));
    return `D-${++this.lastDecision}`;
  }

  async createDecision(mapId: string, input: DecisionInput): Promise<DecisionRecord> {
    const e = await this.entry(mapId);
    const d = buildDecision(await this.nextDecisionId(), mapId, input);
    const ticket = d.ticketId ? e.snap.tickets.find((t) => t.id === d.ticketId) : undefined;
    await this.write(mapId, {
      label: `decision ${d.id}`,
      queue: true,
      send: () => this.remotePostDecision(e.snap.map, d, ticket),
      apply: (en) => en.decisions.push(d),
      event: { kind: 'decision.recorded', mapId, decisionId: d.id, ticketId: d.ticketId },
    });
    return structuredClone(d);
  }

  async markSuperseded(mapId: string, decisionId: string, supersededBy: string) {
    const e = await this.entry(mapId);
    const d = e.decisions.find((x) => x.id === decisionId);
    if (!d) throw new OperationError(`decision ${decisionId} not found in ${mapId}`);
    const next = { ...d, supersededBy };
    await this.write(mapId, {
      label: `supersede ${decisionId}`,
      queue: true,
      send: () => this.remoteUpdateDecision(e.snap.map, next),
      apply: (en) => (en.decisions = en.decisions.map((x) => (x.id === decisionId ? next : x))),
      event: { kind: 'decision.superseded', mapId, decisionId, supersededBy },
    });
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
    while (this.outbox.length) {
      const op = this.outbox[0];
      try {
        await op.send();
      } catch (err) {
        if (isTransient(err)) throw err;
        // the tracker rejected it for good (deleted issue, revoked access): drop it rather than block the queue
        this.outbox.shift();
        this.setStatus({ error: `Dropped queued write (${op.label}): ${(err as Error).message}` });
        continue;
      }
      this.outbox.shift();
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
      const before = new Set(this.maps?.list.map((m) => m.id));
      const list = await this.fetchMaps();
      this.maps = { list, at: this.now() };
      if (list.some((m) => !before.has(m.id)) || list.length !== before.size) this.emit({ kind: 'external.changed' });
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

  /** Stops polling. Queued writes that were not sent are dropped. */
  dispose() {
    this.closed = true;
    clearTimeout(this.timer);
  }
}
