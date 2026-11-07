import { DISCOVERY_TYPES } from '../../discovery/brief';
import type { AttentionSource, Candidate } from '../types';

/** Submitted discovery briefs: implementation in the trail waits until the trail lead accepts one. */
export const briefSource: AttentionSource = {
  kind: 'brief',
  collect({ briefs, snaps }) {
    const byMap = new Map(snaps.map((s) => [s.map.id, s]));
    return briefs.flatMap((b): Candidate[] => {
      const snap = byMap.get(b.mapId);
      if (b.status !== 'submitted' || !snap) return [];
      const gated = snap.tickets.filter((t) => t.state === 'open' && !DISCOVERY_TYPES.includes(t.type));
      return [
        {
          kind: 'brief',
          mapId: b.mapId,
          ticketId: b.ticketId,
          title: `Review the discovery brief for ${snap.map.title}`,
          since: b.submittedAt ?? 0,
          urgency: 'soon',
          ref: b.ticketId ?? b.mapId,
          agent: b.author,
          holds: gated.map((t) => t.id),
          notes: ['implementation waits for your review'],
        },
      ];
    });
  },
};
