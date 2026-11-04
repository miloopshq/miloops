import type { AttentionSource, Candidate } from '../types';

/** Finished work that changed files the risk policy marks high, without the human having a say on that ticket. */
export const policySource: AttentionSource = {
  kind: 'policy',
  collect({ violations = [] }) {
    return violations.map((v): Candidate => ({
      kind: 'policy',
      mapId: v.mapId,
      ticketId: v.ticketId,
      title: `Check ${v.ticketKey}: high-risk files changed without asking`,
      since: v.at,
      urgency: 'soon',
      ref: v.ticketId,
      agent: v.agent,
      holds: [],
      notes: [v.reason],
    }));
  },
};
