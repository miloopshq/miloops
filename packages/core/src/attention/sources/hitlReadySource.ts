import { attention, deriveStates } from '../../planning/derive';
import type { AttentionSource, Candidate } from '../types';
import { clip } from './clip';

const WHY: Record<string, string> = {
  junction: 'a junction needs your answers',
  prototype: 'a prototype needs your judgment',
};

/** Ready tickets no agent can finish alone (junction, prototype, HITL tasks) that nobody is working on. */
export const hitlReadySource: AttentionSource = {
  kind: 'hitl-ready',
  collect({ snaps, questions }) {
    const asked = new Set(questions.map((q) => q.ticketId).filter(Boolean));
    return snaps.flatMap((snap) => {
      const states = deriveStates(snap.tickets, snap.map.mode);
      return snap.tickets
        .filter((t) => states.get(t.id) === 'frontier' && attention(t) === 'hitl' && !asked.has(t.id))
        .map((t): Candidate => ({
          kind: 'hitl-ready',
          mapId: snap.map.id,
          ticketId: t.id,
          title: clip(`${t.key} ${t.title}`),
          since: t.updatedAt,
          urgency: 'soon',
          ref: t.id,
          holds: [t.id],
          notes: [WHY[t.type] ?? 'needs a person to take it'],
        }));
    });
  },
};
