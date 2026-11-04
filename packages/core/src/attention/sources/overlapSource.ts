import { leaseHealth, type TicketLease } from '../../agents/ticketLease';
import { pairsLabel, touchOverlaps } from '../../workspaces/touches';
import type { AttentionSource, Candidate } from '../types';

/**
 * Two live claims whose declared files overlap (claim_ticket `touches`). One item per pair, on the newer claim,
 * so "hold" (return to queue) applies to the agent that came second; either claim can still be held.
 */
export const overlapSource: AttentionSource = {
  kind: 'overlap',
  collect({ leases, now }) {
    const live = leases.filter((l) => !l.returned && l.touches?.length && leaseHealth(l, now) !== 'expired');
    return live.flatMap((mine): Candidate[] =>
      touchOverlaps({ mapId: mine.mapId, ticketId: mine.ticketId, touches: mine.touches ?? [] }, live, now)
        .map((o) => ({ o, other: live.find((l) => l.ticketId === o.ticketId && l.mapId === o.mapId) }))
        .filter((x): x is { o: (typeof x)['o']; other: TicketLease } => !!x.other && isNewer(mine, x.other))
        .map(({ o, other }) => ({
          kind: 'overlap',
          mapId: mine.mapId,
          ticketId: mine.ticketId,
          title: 'Two agents may change the same files',
          since: mine.claimedAt,
          urgency: 'soon',
          ref: `${other.ticketId}+${mine.ticketId}`,
          agent: mine.agent,
          holds: [],
          notes: [
            `${mine.agent} on ${mine.ticketKey}, ${other.agent} on ${other.ticketKey}`,
            `both touch ${pairsLabel(o.pairs)}`,
            'hold one claim to avoid a clash',
          ],
        })),
    );
  },
};

/** The later of two claims (ties by ticket id), so each pair shows once. */
function isNewer(a: TicketLease, b: TicketLease) {
  if (a.claimedAt !== b.claimedAt) return a.claimedAt > b.claimedAt;
  return a.ticketId.localeCompare(b.ticketId, undefined, { numeric: true }) > 0;
}
