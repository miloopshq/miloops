import { leaseHealth } from '../../agents/ticketLease';
import type { AttentionSource, Candidate } from '../types';

/** Claims whose agent stopped reporting: the ticket is held but nobody seems to work on it. */
export const stalledSource: AttentionSource = {
  kind: 'stalled',
  collect({ leases, now }) {
    return leases.flatMap((l): Candidate[] => {
      if (l.returned) return [];
      const health = leaseHealth(l, now);
      if (health === 'live') return [];
      const expired = health === 'expired';
      return [
        {
          kind: 'stalled',
          mapId: l.mapId,
          ticketId: l.ticketId,
          title: `${l.agent} stopped reporting on ${l.ticketKey}`,
          since: l.renewedAt,
          urgency: expired ? 'soon' : 'fyi',
          ref: l.ticketId,
          agent: l.agent,
          holds: [l.ticketId],
          notes: [expired ? 'claim expired; it goes back to the queue' : 'claim stalled'],
        },
      ];
    });
  },
};
