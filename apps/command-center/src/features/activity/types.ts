import type { ActivityState, MapSnapshot, TicketLease } from '@miloops-hq/core';

export type ZoneProps = {
  activity: ActivityState;
  snap?: MapSnapshot;
  leases?: TicketLease[];
  onTicket: (id: string) => void;
  onOpenChat: (id: string) => void;
};
