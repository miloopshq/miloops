import type { AttentionSource, Candidate } from '../types';
import { clip } from './clip';

/**
 * Signs the plan may be wrong (rerouteTriggers): a ticket blocked after its last attempt, a superseded decision with
 * done dependents, a cancelled ticket open work still waits on, a pull request closed without merging. Only a
 * suggestion: nothing is proposed or changed until an agent proposes a reroute and the trail lead approves it.
 */
export const rerouteSuggestedSource: AttentionSource = {
  kind: 'reroute-suggested',
  collect({ suggestions = [], snaps }) {
    const byMap = new Map(snaps.map((s) => [s.map.id, s]));
    return suggestions.map((s): Candidate => {
      const snap = byMap.get(s.mapId);
      const ticket = snap?.tickets.find((t) => t.id === s.ticketId);
      return {
        kind: 'reroute-suggested',
        mapId: s.mapId,
        ticketId: s.ticketId,
        title: clip(`Reroute suggested: ${s.reason}`),
        since: ticket?.updatedAt ?? snap?.map.updatedAt ?? 0,
        urgency: 'fyi',
        ref: s.id,
        holds: s.tickets,
        notes: ['ask an agent to propose a new plan, or carry on'],
      };
    });
  },
};
