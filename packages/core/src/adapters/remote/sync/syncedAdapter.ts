import type { TicketMetaPatch } from '../../../model/lifecycle';
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
import { roundtrip } from './fingerprint';
import { ticketOf } from './queuedWrites';
import { SyncedWriter } from './syncedWriter';
import type { EventInit } from './types';

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
export abstract class SyncedAdapter extends SyncedWriter implements TrackerAdapter {
  abstract readonly kind: 'github' | 'linear';
  abstract readonly label: string;
  abstract readonly location: string;

  private lastDecision = 0;
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

  async setMeta(mapId: string, ticketId: string, patch: TicketMetaPatch) {
    const t = ticketOf(await this.entry(mapId), ticketId);
    await this.change(
      mapId,
      `${patch.status ? `mark ${patch.status}` : 'clear status of'} ${t.key}`,
      { kind: 'meta', ticketId, patch },
      { kind: 'ticket.updated', mapId, ticketId },
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
