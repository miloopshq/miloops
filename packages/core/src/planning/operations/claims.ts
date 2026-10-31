import type { TrackerAdapter } from '../../adapters/adapter';
import type { ActorKind } from '../../model/lifecycle';
import type { MapSnapshot, TicketType } from '../../model/types';
import { frontier, deriveStates } from '../derive';
import { transition, type TransitionOptions } from '../lifecycle/transition';
import { OperationError } from './operationError';

/** Who is acting, for the journal. Agents are the default actor kind. */
export interface ActorOptions extends TransitionOptions {
  actorKind?: ActorKind;
  reason?: string;
  sessionId?: string;
}

/**
 * The ticket to work next: rework first (a failed attempt waits on a fix),
 * then reviews (finished work waits on them), then the frontier, oldest first.
 */
export function chooseNext(snap: MapSnapshot, opts: { types?: TicketType[]; exclude?: string[] } = {}) {
  const states = deriveStates(snap.tickets, snap.map.mode);
  const rework = snap.tickets.filter((t) => states.get(t.id) === 'rework').sort((a, b) => a.createdAt - b.createdAt);
  const ready = frontier(snap.tickets, snap.map.mode);
  return [...rework, ...ready.filter((t) => t.type === 'review'), ...ready.filter((t) => t.type !== 'review')].find(
    (t) => (!opts.types || opts.types.includes(t.type)) && !opts.exclude?.includes(t.id),
  );
}

/** Claim = assignment. Re-reads after assigning to detect a parallel session winning the race. */
export async function claim(
  adapter: TrackerAdapter,
  mapId: string,
  ticketId: string,
  assignee: string,
  opts: ActorOptions = {},
) {
  const before = await adapter.loadMap(mapId);
  const t = before.tickets.find((x) => x.id === ticketId);
  if (!t) throw new OperationError(`ticket ${ticketId} not found`);
  const state = deriveStates(before.tickets, before.map.mode).get(ticketId);
  if (state !== 'frontier' && state !== 'rework') throw new OperationError(`${t.key} is ${state}, not on the frontier`);
  await transition(
    adapter,
    mapId,
    ticketId,
    {
      event: 'claim',
      actor: assignee,
      actorKind: opts.actorKind ?? 'agent',
      reason: opts.reason,
      sessionId: opts.sessionId,
    },
    opts,
  );
  const after = await adapter.loadMap(mapId);
  const now = after.tickets.find((x) => x.id === ticketId)!;
  if (now.assignee !== assignee) throw new OperationError(`${t.key} was claimed by ${now.assignee}`);
  return now;
}

/** Back to the queue (ready, or rework when an attempt failed). `actor` defaults to the assignee. */
export async function release(
  adapter: TrackerAdapter,
  mapId: string,
  ticketId: string,
  opts: ActorOptions & { actor?: string } = {},
) {
  const snap = await adapter.loadMap(mapId);
  const t = snap.tickets.find((x) => x.id === ticketId);
  if (!t) throw new OperationError(`ticket ${ticketId} not found`);
  await transition(
    adapter,
    mapId,
    ticketId,
    {
      event: 'release',
      actor: opts.actor ?? t.assignee ?? 'operator',
      actorKind: opts.actorKind ?? 'agent',
      reason: opts.reason,
      sessionId: opts.sessionId,
    },
    opts,
  );
}
