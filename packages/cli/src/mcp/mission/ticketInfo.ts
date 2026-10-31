import type { DecisionRecord, MapSnapshot, Ticket } from '@miloops-hq/core';
import { verificationView } from './verificationView';
import { ticketView } from './views';

/** A ticket as tools return it: the view, plus the checks its completion needs and any rework feedback. */
export const ticketInfo = (root: string, snap: MapSnapshot, t: Ticket, records: DecisionRecord[] = []) => ({
  ...ticketView(snap, t, records),
  ...verificationView(root, snap, t),
});
