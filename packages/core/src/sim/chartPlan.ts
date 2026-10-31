import type { ChartPlan } from '../planning/operations/chart';

/** The simulated agent's opening frontier for a new mission. */
export function chartPlanFor(title: string, destination: string): ChartPlan {
  const subject = title.replace(/^(ship|build|add|launch)\s+/i, '');
  return {
    title,
    sections: {
      destination,
      notes: 'Charted from the command center. Initial frontier proposed by the simulated agent.',
      decisions: [],
      unspecified: [
        `Pricing implications of ${subject}`,
        'Migration path for existing users',
        'Observability and alerting',
        'Accessibility review',
      ],
      outOfScope: ['Native desktop clients — later phase'],
    },
    tickets: [
      {
        ref: 'a',
        type: 'grilling',
        title: `Who is the primary user of ${subject}?`,
        body: 'Pin down the primary persona before designing.',
      },
      {
        ref: 'b',
        type: 'research',
        title: `Prior art for ${subject}`,
        body: 'Survey how comparable products solve this.',
      },
      {
        ref: 'c',
        type: 'research',
        title: 'Technical constraints and platform limits',
        body: 'What hard limits apply?',
      },
      {
        ref: 'd',
        type: 'prototype',
        title: 'Spike the riskiest integration point',
        body: 'Throwaway spike to de-risk.',
        blockedBy: ['b', 'c'],
      },
      {
        ref: 'e',
        type: 'grilling',
        title: 'What does "done" look like for v1?',
        body: 'Agree acceptance criteria.',
        blockedBy: ['a'],
      },
      {
        ref: 'f',
        type: 'task',
        title: 'Write the design doc',
        body: 'Consolidate decisions into a design doc.',
        blockedBy: ['d', 'e'],
      },
      {
        ref: 'g',
        type: 'execute',
        title: 'Implement the v1 slice behind a flag',
        body: 'Carry out the decided design.',
        blockedBy: ['f'],
      },
      {
        ref: 'h',
        type: 'task',
        hitl: true,
        title: 'Approve rollout and measurement plan',
        body: 'Flagged rollout with success metrics.',
        blockedBy: ['g'],
      },
    ],
  };
}
