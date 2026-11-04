import type { ReplanProposal } from '../../model/replan';
import type { AttentionSource, Candidate } from '../types';
import { clip } from './clip';

/** What a challenge to the destination says, in a few words. */
const DESTINATION_REASON: Record<NonNullable<ReplanProposal['destinationReason']>, string> = {
  'already-exists': 'the work already exists',
  'wrong-problem': 'the mission targets the wrong problem',
  rescope: 'the mission should be rescoped',
};

/** Pending replan proposals: the tickets they touch are frozen until the operator approves or rejects. */
export const replanSource: AttentionSource = {
  kind: 'replan',
  collect({ replans = [] }) {
    return replans.map(({ proposal: p, frozen }): Candidate => {
      const notes = [p.kind === 'challenge-destination' ? 'challenges the destination' : 'proposes a new plan'];
      if (p.destinationReason) notes.push(DESTINATION_REASON[p.destinationReason]);
      if (frozen.length) notes.push(`freezes ${frozen.length} ticket${frozen.length === 1 ? '' : 's'}`);
      return {
        kind: 'replan',
        mapId: p.mapId,
        title: clip(`Review ${p.id}: ${p.reason}`),
        since: p.at,
        urgency: 'soon',
        ref: p.id,
        agent: p.by,
        holds: frozen,
        notes,
      };
    });
  },
};
