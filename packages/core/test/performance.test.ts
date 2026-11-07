import { describe, expect, it } from 'vitest';
import { type MapSnapshot, type Ticket, type TransitionEntry, performanceReport } from '../src';

const MIN = 60_000;
const t0 = 1_000_000_000_000;

const ticket = (id: string, patch: Partial<Ticket> = {}): Ticket => ({
  id,
  key: `#${id}`,
  title: id,
  type: 'task',
  body: '',
  state: 'open',
  blockedBy: [],
  comments: [],
  createdAt: t0,
  updatedAt: t0,
  ...patch,
});

const entry = (mapId: string, ticketId: string, at: number, patch: Partial<TransitionEntry>): TransitionEntry => ({
  v: 1,
  kind: 'transition',
  at,
  mapId,
  ticketId,
  ticketKey: `#${ticketId}`,
  event: 'claim',
  from: 'ready',
  to: 'working',
  actor: 'claude-01',
  actorKind: 'agent',
  ...patch,
});

const snap = (id: string, tickets: Ticket[]) => ({ map: { id, createdAt: t0 }, tickets }) as unknown as MapSnapshot;

/** `n` done tickets of a type by one agent, each `leadMin` minutes, the first `reworks` sent back once. */
function batch(mapId: string, agent: string, n: number, leadMin: number, reworks = 0, type: Ticket['type'] = 'task') {
  const tickets: Ticket[] = [];
  const journal: TransitionEntry[] = [];
  for (let i = 0; i < n; i++) {
    const id = `${agent}-${type}-${i}`;
    tickets.push(ticket(id, { type, state: 'closed', closedAt: t0 + leadMin * MIN }));
    journal.push(entry(mapId, id, t0, { actor: agent }));
    if (i < reworks)
      journal.push(
        entry(mapId, id, t0 + MIN, { event: 'reject', to: 'rework', actor: 'trail lead', actorKind: 'trail lead' }),
      );
  }
  return { tickets, journal };
}

describe('performanceReport', () => {
  it('groups tickets by the agent that last claimed them, its vendor, and ticket type, across trails', () => {
    const a = batch('a', 'claude-01', 2, 10);
    const b = batch('b', 'codex-02', 1, 20, 0, 'research');
    const r = performanceReport([
      { snap: snap('a', a.tickets), journal: a.journal, answered: [] },
      { snap: snap('b', b.tickets), journal: b.journal, answered: [] },
    ]);
    expect(r.trails).toBe(2);
    expect(r.tickets).toBe(3);
    expect(r.byAgent.map((x) => [x.key, x.done])).toEqual([
      ['claude-01', 2],
      ['codex-02', 1],
    ]);
    expect(r.byVendor.map((x) => x.key)).toEqual(['claude', 'codex']);
    expect(r.byType.find((x) => x.key === 'research')?.medianLeadMs).toBe(20 * MIN);
  });

  it('credits a handed-over ticket to whoever claimed it last, and leaves unclaimed work out of agents', () => {
    const t = ticket('t');
    const r = performanceReport([
      {
        snap: snap('a', [t, ticket('never')]),
        journal: [entry('a', 't', t0, { actor: 'claude-01' }), entry('a', 't', t0 + MIN, { actor: 'codex-01' })],
        answered: [],
      },
    ]);
    expect(r.byAgent.map((x) => x.key)).toEqual(['codex-01']);
    expect(r.byType[0].tickets).toBe(2);
  });

  it('falls back to the assignee when the journal has no claim', () => {
    const t = ticket('t', { assignee: 'codex-03', state: 'closed', closedAt: t0 });
    const r = performanceReport([{ snap: snap('a', [t]), journal: [], answered: [] }]);
    expect(r.byAgent[0]).toMatchObject({ key: 'codex-03', done: 1 });
  });

  it('leaves tickets assigned to a person out of agents and vendors', () => {
    const r = performanceReport([{ snap: snap('a', [ticket('t', { assignee: 'sam' })]), journal: [], answered: [] }]);
    expect(r.byAgent).toEqual([]);
    expect(r.byVendor).toEqual([]);
    expect(r.byType[0].tickets).toBe(1);
  });

  it('counts findings for the reviewer, and an accepted ticket overrules them', () => {
    const work = ticket('w');
    const stood = ticket('r1', { type: 'review', reviewOf: 'w' });
    const overruled = ticket('r2', { type: 'review', reviewOf: 'w' });
    const journal = [
      entry('a', 'w', t0, { actor: 'claude-01' }),
      entry('a', 'r1', t0 + MIN, { actor: 'codex-01' }),
      entry('a', 'w', t0 + 2 * MIN, {
        event: 'review.fail',
        from: 'verifying',
        to: 'rework',
        actor: 'teamtrail',
        actorKind: 'engine',
      }),
      entry('a', 'r2', t0 + 3 * MIN, { actor: 'codex-01' }),
      entry('a', 'w', t0 + 4 * MIN, {
        event: 'review.fail',
        from: 'verifying',
        to: 'rework',
        actor: 'teamtrail',
        actorKind: 'engine',
      }),
      entry('a', 'w', t0 + 5 * MIN, {
        event: 'accept',
        from: 'blocked',
        to: 'done',
        actor: 'trail lead',
        actorKind: 'trail lead',
      }),
    ];
    const r = performanceReport([{ snap: snap('a', [work, stood, overruled]), journal, answered: [] }]);
    expect(r.byVendor.find((x) => x.key === 'codex')?.findings).toEqual({ raised: 2, upheld: 1 });
  });

  it('counts answered questions once, for whoever asked', () => {
    const q = { id: 'q', mapId: 'a', sessionId: 's', agent: 'codex-01', askedAt: t0, answeredAt: t0 };
    const r = performanceReport([{ snap: snap('a', []), journal: [], answered: [q, q] }]);
    expect(r.byAgent[0]).toMatchObject({ key: 'codex-01', answers: 1 });
  });

  it('says nothing until both sides have enough results', () => {
    const a = batch('a', 'claude-01', 4, 10, 4);
    const b = batch('a', 'codex-01', 4, 40);
    const r = performanceReport([
      { snap: snap('a', [...a.tickets, ...b.tickets]), journal: [...a.journal, ...b.journal], answered: [] },
    ]);
    expect(r.recommendations).toEqual([]);
  });

  it('recommends from real differences, and the same inputs give the same words', () => {
    const a = batch('a', 'claude-01', 6, 10, 6, 'research');
    const b = batch('a', 'codex-01', 6, 40, 0, 'research');
    const input = [
      { snap: snap('a', [...a.tickets, ...b.tickets]), journal: [...a.journal, ...b.journal], answered: [] },
    ];
    const r = performanceReport(input);
    expect(r.recommendations.map((x) => x.id)).toEqual(['rework', 'speed-research']);
    expect(r.recommendations[0].text).toContain('claude work goes back to rework');
    expect(r.recommendations[1].text).toContain('research tickets: claude is faster');
    expect(performanceReport(input)).toEqual(r);
  });
});
