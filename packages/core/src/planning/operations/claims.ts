import type { TrackerAdapter } from '../../adapters/adapter';
import type { MapSnapshot, TicketType } from '../../model/types';
import { frontier, deriveStates } from '../derive';
import { OperationError } from './operationError';

export function chooseNext(snap: MapSnapshot, opts: { types?: TicketType[]; exclude?: string[] } = {}) {
  return frontier(snap.tickets, snap.map.mode).find(
    (t) => (!opts.types || opts.types.includes(t.type)) && !opts.exclude?.includes(t.id),
  );
}

/** Claim = assignment. Re-reads after assigning to detect a parallel session winning the race. */
export async function claim(adapter: TrackerAdapter, mapId: string, ticketId: string, assignee: string) {
  const before = await adapter.loadMap(mapId);
  const t = before.tickets.find((x) => x.id === ticketId);
  if (!t) throw new OperationError(`ticket ${ticketId} not found`);
  const state = deriveStates(before.tickets, before.map.mode).get(ticketId);
  if (state !== 'frontier') throw new OperationError(`${t.key} is ${state}, not on the frontier`);
  await adapter.assign(mapId, ticketId, assignee);
  const after = await adapter.loadMap(mapId);
  const now = after.tickets.find((x) => x.id === ticketId)!;
  if (now.assignee !== assignee) throw new OperationError(`${t.key} was claimed by ${now.assignee}`);
  return now;
}

export async function release(adapter: TrackerAdapter, mapId: string, ticketId: string) {
  await adapter.assign(mapId, ticketId, null);
}
