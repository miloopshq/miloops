import { describe, expect, it } from 'vitest';
import {
  buildBriefing,
  deliveryReport,
  deliveryToMarkdown,
  filterDecisions,
  madeBy,
  type DecisionRecord,
  type MapSnapshot,
  type Ticket,
  type TransitionEntry,
} from '../src';

const MIN = 60_000;
const t0 = 1_000_000_000_000;

function ticket(id: string, patch: Partial<Ticket> = {}): Ticket {
  return {
    id,
    key: `#${id}`,
    title: `Ticket ${id}`,
    type: 'task',
    body: '',
    state: 'open',
    blockedBy: [],
    comments: [],
    createdAt: t0,
    updatedAt: t0,
    ...patch,
  };
}

function entry(ticketId: string, at: number, patch: Partial<TransitionEntry>): TransitionEntry {
  return {
    v: 1,
    kind: 'transition',
    at,
    mapId: 'm1',
    ticketId,
    ticketKey: `#${ticketId}`,
    event: 'claim',
    from: 'ready',
    to: 'working',
    actor: 'claude-01',
    actorKind: 'agent',
    ...patch,
  };
}

const snap: MapSnapshot = {
  map: {
    id: 'm1',
    key: '#1',
    title: 'Mission',
    mode: 'plan+execute',
    sections: { destination: 'Done', notes: '', decisions: [], unspecified: [], outOfScope: [] },
    createdAt: t0,
    updatedAt: t0,
  },
  tickets: [
    ticket('2', { state: 'closed', closeReason: 'completed', closedAt: t0 + 70 * MIN }),
    ticket('3', { state: 'closed', closeReason: 'completed', closedAt: t0 + 30 * MIN }),
    ticket('4', { state: 'closed', closeReason: 'not_planned', closedAt: t0 + 5 * MIN }),
    ticket('5'),
    ticket('9', { type: 'review', reviewOf: '2', state: 'closed', closeReason: 'completed', closedAt: t0 + 60 * MIN }),
  ],
};

const journal: TransitionEntry[] = [
  entry('2', t0 + 10 * MIN, { event: 'claim' }),
  entry('2', t0 + 20 * MIN, { event: 'submit', from: 'working', to: 'verifying' }),
  entry('2', t0 + 25 * MIN, {
    event: 'checks.fail',
    from: 'verifying',
    to: 'rework',
    actorKind: 'engine',
    actor: 'miloops',
  }),
  entry('2', t0 + 40 * MIN, { event: 'submit', from: 'rework', to: 'verifying' }),
  entry('2', t0 + 50 * MIN, {
    event: 'review.fail',
    from: 'verifying',
    to: 'rework',
    actorKind: 'engine',
    actor: 'miloops',
  }),
  entry('2', t0 + 55 * MIN, {
    event: 'reject',
    from: 'verifying',
    to: 'rework',
    actor: 'operator',
    actorKind: 'operator',
  }),
  entry('2', t0 + 65 * MIN, {
    event: 'approve',
    from: 'verifying',
    to: 'done',
    actor: 'operator',
    actorKind: 'operator',
  }),
  entry('3', t0 + 20 * MIN, { event: 'claim' }),
  entry('4', t0 + 5 * MIN, {
    event: 'cancel',
    from: 'ready',
    to: 'cancelled',
    actor: 'operator',
    actorKind: 'operator',
  }),
  entry('2', t0, { mapId: 'other', event: 'approve', actorKind: 'operator' }),
];

const answered = [
  { id: 'q1', mapId: 'm1', sessionId: 's1', agent: 'claude-01', askedAt: t0, answeredAt: t0 + MIN },
  { id: 'q1', mapId: 'm1', sessionId: 's1', agent: 'claude-01', askedAt: t0, answeredAt: t0 + MIN },
  { id: 'q2', mapId: 'other', sessionId: 's2', agent: 'claude-02', askedAt: t0, answeredAt: t0 + MIN },
];

describe('deliveryReport', () => {
  const r = deliveryReport({ snap, journal, answered, usage: { inputTokens: 900, outputTokens: 100, costUsd: 0.5 } });

  it('counts outcomes, without review tickets', () => {
    expect([r.done, r.cancelled, r.open]).toEqual([2, 1, 1]);
    expect(r.tickets.map((t) => t.id)).toEqual(['2', '3', '4', '5']);
  });

  it('measures lead times from first claim to done, and the mission from creation', () => {
    expect(r.tickets.find((t) => t.id === '2')?.leadMs).toBe(60 * MIN);
    expect(r.tickets.find((t) => t.id === '3')?.leadMs).toBe(10 * MIN);
    expect(r.medianLeadMs).toBe(35 * MIN);
    expect(r.missionLeadMs).toBe(70 * MIN);
  });

  it('counts rework cycles, review verdicts on the reviewed work, and human calls', () => {
    expect(r.rework).toEqual({ tickets: 1, cycles: 3 });
    expect(r.reviews).toEqual({ passed: 0, failed: 1, needsHuman: 0 });
    expect(r.interventions).toEqual({ answers: 1, operatorActions: 3, reworkRequested: 1, total: 4 });
  });

  it('prices verified tickets, and copes with no spend or no claims', () => {
    expect(r.spend).toEqual({ costUsd: 0.5, tokens: 1000, perVerifiedTicketUsd: 0.25 });
    const empty = deliveryReport({ snap, journal: [], answered: [] });
    expect(empty.spend.perVerifiedTicketUsd).toBeUndefined();
    expect(empty.medianLeadMs).toBeUndefined();
    expect(empty.interventions.total).toBe(0);
  });

  it('exports markdown with the same numbers', () => {
    const md = deliveryToMarkdown(r, 'Mission', t0);
    expect(md).toContain('| Tickets done / cancelled / open | 2 / 1 / 1 |');
    expect(md).toContain('4 (1 answers, 3 operator actions, 1 sent back)');
    expect(md).toContain('| Cost per verified ticket | $0.2500 |');
    expect(md).toContain('| #2 Ticket 2 | task | done | 60 min | 3 | 0/1 | 2 |');
  });
});

describe('madeBy', () => {
  const base = { source: { kind: 'agent' as const } };
  it('tells agent calls from the human answers agents record', () => {
    expect(madeBy({ ...base, decidedBy: 'claude-01' })).toBe('agent');
    expect(madeBy({ ...base, decidedBy: 'operator' })).toBe('human');
    expect(madeBy({ ...base, decidedBy: 'slack:U123' })).toBe('human');
    expect(madeBy({ source: { kind: 'command-center' }, decidedBy: 'operator' })).toBe('human');
  });

  const decision = (id: string, decidedBy: string): DecisionRecord => ({
    id,
    mapId: 'm1',
    question: 'Q?',
    answer: 'A.',
    summary: 'A.',
    alternatives: [],
    rationale: '',
    decidedBy,
    decidedAt: t0 + MIN,
    participants: [],
    source: { kind: 'agent' },
    transcript: [],
  });
  const decisions = [decision('D-1', 'claude-01'), decision('D-2', 'operator')];

  it('drives the briefing count and the Decisions filter', () => {
    const b = buildBriefing({
      snaps: [snap],
      decisions,
      activity: { sessions: [], feed: [], chats: [], pending: [], answered: [], usageByMap: {} },
      since: () => t0,
      now: t0 + 2 * MIN,
    });
    expect(b.missions[0].agentDecisions.map((d) => d.id)).toEqual(['D-1']);
    expect(filterDecisions(decisions, { madeBy: 'agent' }).map((d) => d.id)).toEqual(['D-1']);
    expect(filterDecisions(decisions, { madeBy: 'human' }).map((d) => d.id)).toEqual(['D-2']);
  });
});
