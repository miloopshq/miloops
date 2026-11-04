import type { AttentionSource, Candidate } from '../types';
import { clip } from './clip';

/** Open PR/CI mismatch flags: the pull request or its checks don't match what the agent claimed. */
export const flagSource: AttentionSource = {
  kind: 'flag',
  collect({ syncs }) {
    return syncs.flatMap((s) =>
      s.flags.map((f): Candidate => ({
        kind: 'flag',
        mapId: s.mapId,
        ticketId: s.ticketId,
        title: clip(`${s.ticketKey}: ${f.text}`),
        since: f.since,
        urgency: f.severity === 'alert' ? 'soon' : 'fyi',
        ref: `${s.ticketId}/${f.kind}`,
        holds: [],
      })),
    );
  },
};
