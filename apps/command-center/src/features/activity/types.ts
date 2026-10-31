import type { ActivityState, MapSnapshot } from '@miloops-hq/core';

export type ZoneProps = {
  activity: ActivityState;
  snap?: MapSnapshot;
  onTicket: (id: string) => void;
  onOpenChat: (id: string) => void;
};
