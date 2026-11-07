import type { AttentionSource, Candidate } from '../types';
import { clip } from './clip';

/** Verifying tickets waiting for the trail lead's approval or sign-off. */
export const approvalSource: AttentionSource = {
  kind: 'approval',
  collect({ approvals }) {
    return approvals
      .filter((a) => a.kind === 'approve')
      .map((a): Candidate => ({
        kind: 'approval',
        mapId: a.mapId,
        ticketId: a.ticketId,
        title: clip(`Approve ${a.ticketKey} ${a.title}`),
        since: a.at,
        urgency: 'soon',
        ref: a.ticketId,
        holds: [a.ticketId],
        notes: [clip(a.reason, 120)],
      }));
  },
};
