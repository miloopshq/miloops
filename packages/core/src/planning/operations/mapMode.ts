import type { TrackerAdapter } from '../../adapters/adapter';
import { type MapMode, type TicketType, TICKET_TYPES } from '../../model/types';
import { OperationError } from './operationError';

/** Switch a map between plan+execute and plan-only. */
export async function setMapMode(adapter: TrackerAdapter, mapId: string, mode: MapMode) {
  await adapter.setMapMode(mapId, mode);
}

export function allowedTypes(mode: MapMode): TicketType[] {
  return mode === 'plan-only' ? TICKET_TYPES.filter((t) => t !== 'execute') : TICKET_TYPES;
}

export function assertTypeAllowed(mode: MapMode, type: TicketType) {
  if (!allowedTypes(mode).includes(type)) throw new OperationError(`${type} tickets are disabled on plan-only maps`);
}
