import type {
  DecisionInput,
  DecisionRecord,
  MapDoc,
  MapMode,
  MapSections,
  Ticket,
  TicketType,
} from '../../../model/types';
import { buildDecision, decisionNumber } from '../../../planning/decisions/decisionRecord';
import { OperationError } from '../../../planning/operations/operationError';
import type { TrackerAdapter } from '../../adapter';
import { isTransient } from '../http';
import { roundtrip } from './fingerprint';
import { applyWrite, ticketOf, writeId } from './queuedWrites';
import { SyncedStore } from './syncedStore';
import type { CacheEntry, EventInit, QueuedChange, QueuedWrite } from './types';

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
export abstract class SyncedAdapter extends SyncedStore implements TrackerAdapter {
  abstract readonly kind: 'github' | 'linear';
  abstract readonly label: string;
  abstract readonly location: string;

  protected abstract remoteCreateMap(input: { title: string; sections: MapSections; mode: MapMode }): Promise<MapDoc>;
  protected abstract remoteCreateTicket(
    map: MapDoc,
    input: { title: string; type: TicketType; body: string; hitl?: boolean },
  ): Promise<Ticket>;
  protected abstract remoteAddBlocking(map: MapDoc, blocker: Ticket, blocked: Ticket): Promise<void>;
  /** Persist the claim (`t.assignee`) of an already-updated ticket. */
  protected abstract remoteSetClaim(map: MapDoc, t: Ticket): Promise<void>;
  /** `writeId` must be readable back as the comment's `writeId`. */
  protected abstract remoteComment(
    map: MapDoc,
    t: Ticket,
    author: string,
    body: string,
    writeId: string,
  ): Promise<void>;
  protected abstract remoteClose(map: MapDoc, t: Ticket, reason: 'completed' | 'not_planned'): Promise<void>;
  protected abstract remoteUpdateMap(map: MapDoc): Promise<void>;
  protected abstract remoteSetMode(map: MapDoc, mode: MapMode): Promise<void>;
  /** Post a decision record on its ticket, or on the mission when it has none. */
  protected abstract remotePostDecision(map: MapDoc, d: DecisionRecord, ticket?: Ticket): Promise<void>;
  protected abstract remoteUpdateDecision(map: MapDoc, d: DecisionRecord): Promise<void>;

  private lastDecision = 0;
  private writes = 0;

  protected send(e: CacheEntry, w: QueuedWrite): Promise<unknown> {
    const c = w.change;
    const map = e.snap.map;
    switch (c.kind) {
      case 'mode':
        return this.remoteSetMode(map, c.mode);
      case 'sections':
        return this.remoteUpdateMap({ ...map, sections: c.sections });
      case 'blocking':
        return this.remoteAddBlocking(map, ticketOf(e, c.blockerId), ticketOf(e, c.blockedId));
      case 'claim':
        return this.remoteSetClaim(map, { ...ticketOf(e, c.ticketId), assignee: c.assignee });
      case 'comment':
        return this.remoteComment(map, ticketOf(e, c.ticketId), c.author, c.body, w.id);
      case 'close':
        return this.remoteClose(map, ticketOf(e, c.ticketId), c.reason);
      case 'decision':
        return this.remotePostDecision(
          map,
          c.decision,
          c.decision.ticketId ? e.snap.tickets.find((t) => t.id === c.decision.ticketId) : undefined,
        );
      case 'supersede': {
        const d = e.decisions.find((x) => x.id === c.decisionId);
        if (!d) throw new OperationError(`decision ${c.decisionId} not found in ${w.mapId}`);
        return this.remoteUpdateDecision(map, { ...d, supersededBy: c.supersededBy });
      }
    }
  }

  /**
   * Sends one queueable write and applies it to the cache. When the tracker is
   * offline or rate limited (or other writes are queued, to keep order) it is
   * applied to the cache now and queued, persisted when there is a store.
   */
  private async change(
    mapId: string,
    label: string,
    change: QueuedChange | ((e: CacheEntry) => QueuedChange),
    event: EventInit,
  ) {
    await this.locks.run(mapId, async () => {
      const e = await this.entry(mapId);
      const c = typeof change === 'function' ? change(e) : change;
      const w: QueuedWrite = {
        id: writeId(mapId, c, this.now, ++this.writes),
        mapId,
        label,
        at: this.now(),
        change: c,
      };
      if (this.queue.length) this.enqueue(w);
      else {
        try {
          await this.send(e, w);
          this.health.online();
        } catch (err) {
          this.health.failed(err);
          if (!isTransient(err)) throw err;
          this.enqueue({ ...w, verify: err.code === 'offline' || undefined });
        }
      }
      applyWrite(e, w, this.now);
      e.at = this.now();
      e.snap.map.updatedAt = this.now();
      this.emit(event);
    });
  }

  private enqueue(w: QueuedWrite) {
    this.queue.push(w);
    this.health.set({});
    const s = this.health.status;
    this.poller.schedule(
      s.state === 'rate-limited' && s.resetAt ? Math.max(1000, s.resetAt - this.now()) : Math.min(this.pollMs, 5000),
    );
  }

  async createMap(input: { title: string; sections: MapSections; mode?: MapMode }): Promise<MapDoc> {
    let map: MapDoc;
    try {
      map = await this.remoteCreateMap({
        title: input.title,
        sections: input.sections,
        mode: input.mode ?? 'plan+execute',
      });
      this.health.online();
    } catch (err) {
      this.health.failed(err);
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
    await this.change(
      mapId,
      'mission sections',
      (e) => ({ kind: 'sections', sections: roundtrip({ ...e.snap.map.sections, ...patch }) }),
      {
        kind: 'map.updated',
        mapId,
        section: Object.keys(patch)[0] as keyof MapSections,
      },
    );
  }

  /** Creates need the tracker's answer (the new id), so they fail fast instead of queueing: never a duplicate issue. */
  async createTicket(
    mapId: string,
    input: { title: string; type: TicketType; body: string; hitl?: boolean },
  ): Promise<Ticket> {
    const t = await this.locks.run(mapId, async () => {
      const e = await this.entry(mapId);
      let r: Ticket;
      try {
        r = await this.remoteCreateTicket(e.snap.map, input);
        this.health.online();
      } catch (err) {
        this.health.failed(err);
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
    const blocker = ticketOf(e, blockerId);
    const blocked = ticketOf(e, blockedId);
    const event: EventInit = { kind: 'edge.added', mapId, blockerId, blockedId };
    if (blocked.blockedBy.includes(blockerId)) return void this.emit(event);
    await this.change(mapId, `${blocker.key} blocks ${blocked.key}`, { kind: 'blocking', blockerId, blockedId }, event);
  }

  async assign(mapId: string, ticketId: string, assignee: string | null) {
    const t = ticketOf(await this.entry(mapId), ticketId);
    await this.change(
      mapId,
      `${assignee ? 'claim' : 'release'} ${t.key}`,
      { kind: 'claim', ticketId, assignee: assignee ?? undefined },
      assignee ? { kind: 'ticket.claimed', mapId, ticketId, assignee } : { kind: 'ticket.released', mapId, ticketId },
    );
  }

  async comment(mapId: string, ticketId: string, author: string, body: string) {
    const t = ticketOf(await this.entry(mapId), ticketId);
    await this.change(
      mapId,
      `comment on ${t.key}`,
      { kind: 'comment', ticketId, author, body },
      { kind: 'ticket.commented', mapId, ticketId },
    );
  }

  async close(mapId: string, ticketId: string, reason: 'completed' | 'not_planned') {
    const t = ticketOf(await this.entry(mapId), ticketId);
    await this.change(
      mapId,
      `close ${t.key}`,
      { kind: 'close', ticketId, reason },
      { kind: 'ticket.closed', mapId, ticketId, reason },
    );
  }

  /** `D-<n>` unique across every mission in the tracker, as with local markdown. */
  private async nextDecisionId() {
    const ids = await this.listMaps()
      .then((l) => l.map((m) => m.id))
      .catch(() => [...this.entries.keys()]);
    const all = await Promise.all(
      ids.map((id) =>
        this.entry(id)
          .then((e) => e.decisions)
          .catch(() => [] as DecisionRecord[]),
      ),
    );
    this.lastDecision = Math.max(this.lastDecision, ...all.flat().map((d) => decisionNumber(d.id)));
    return `D-${++this.lastDecision}`;
  }

  async createDecision(mapId: string, input: DecisionInput): Promise<DecisionRecord> {
    await this.entry(mapId);
    const d = buildDecision(await this.nextDecisionId(), mapId, input);
    await this.change(
      mapId,
      `decision ${d.id}`,
      { kind: 'decision', decision: d },
      { kind: 'decision.recorded', mapId, decisionId: d.id, ticketId: d.ticketId },
    );
    return structuredClone(d);
  }

  async markSuperseded(mapId: string, decisionId: string, supersededBy: string) {
    const e = await this.entry(mapId);
    if (!e.decisions.some((x) => x.id === decisionId))
      throw new OperationError(`decision ${decisionId} not found in ${mapId}`);
    await this.change(
      mapId,
      `supersede ${decisionId}`,
      { kind: 'supersede', decisionId, supersededBy },
      { kind: 'decision.superseded', mapId, decisionId, supersededBy },
    );
  }
}
