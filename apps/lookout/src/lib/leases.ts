import type { TicketLease } from '@teamtrail/core';

/** Leases still held (not returned) on a trail, by ticket id. */
export function heldLeases(leases: TicketLease[] | undefined, mapId: string | undefined) {
  return new Map((leases ?? []).filter((l) => l.mapId === mapId && !l.returned).map((l) => [l.ticketId, l]));
}
