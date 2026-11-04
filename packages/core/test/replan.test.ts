import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chartMap,
  frozenTickets,
  MemoryAdapter,
  replanDiff,
  replanTriggers,
  resolve,
  ruleOutOfScope,
  validateReplan,
  type ReplanChange,
  type ReplanProposal,
  type TrackerAdapter,
} from '../src';
import { journalFile } from '../src/history/journalFile';
import { listKnowledge } from '../src/knowledge/knowledgeStore';
import { addAssumptions, challengeAssumption } from '../src/planning/assumptions/assumptionOps';
import { applyReplan } from '../src/planning/replan/applyReplan';
import { approveReplan, rejectReplan } from '../src/planning/replan/decideReplan';
import { proposeReplan } from '../src/planning/replan/replanFlow';
import { readReplan, writeReplan } from '../src/planning/replan/replanStore';

let root: string;
beforeEach(() => (root = fs.mkdtempSync(path.join(os.tmpdir(), 'miloops-replan-'))));
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** research #1 → execute #2 → task #3, plus a done research #4. */
async function mission(a: TrackerAdapter = new MemoryAdapter({ latency: [0, 0] })) {
  const { map, tickets } = await chartMap(a, {
    title: 'Batch sync',
    sections: { destination: 'Sync in batches', notes: '', decisions: [], unspecified: [], outOfScope: [] },
    tickets: [
      { ref: 'r', title: 'Check the v2 API', type: 'research', body: '' },
      { ref: 'e', title: 'Batch writes', type: 'execute', body: '', blockedBy: ['r'] },
      { ref: 't', title: 'Roll out', type: 'task', body: '', blockedBy: ['e'] },
      { ref: 'd', title: 'Old spike', type: 'research', body: '' },
    ],
  });
  const [r, e, t, d] = tickets;
  await resolve(a, map.id, d.id, { answer: 'Spiked it.', author: 'claude-01' });
  await addAssumptions(a, map.id, [{ text: 'The v2 API supports batch writes', tickets: [e.id] }]);
  return { a, map, r, e, t, d };
}

const draft = (changes: ReplanChange[], extra: Partial<ReplanProposal> = {}) => ({
  kind: 'replan' as const,
  reason: 'v2 has no batch endpoint',
  evidence: 'docs/api.md: POST /items only',
  invalidates: [],
  changes,
  ...extra,
});

describe('validateReplan', () => {
  it('reports every problem with its change index', async () => {
    const { a, map, r, e, d } = await mission();
    const snap = await a.loadMap(map.id);
    const errors = validateReplan(snap, [], {
      ...draft([
        { op: 'add_ticket', ref: 'x', title: 'Fallback', type: 'execute', blockedBy: ['nope'] },
        { op: 'add_ticket', ref: 'x', title: 'Again', type: 'task' },
        { op: 'cancel_ticket', ticket: d.id, reason: 'old' },
        { op: 'rewire', ticket: r.id, addBlockedBy: [e.id] },
        { op: 'reopen', ticket: r.id, reason: 'again' },
        { op: 'supersede_decision', decision: 'D-9', answer: 'a', rationale: 'b' },
      ]),
      invalidates: ['S-7'],
      evidence: ' ',
    });
    expect(errors).toEqual([
      { message: '"evidence" is required: what you found, with paths or output' },
      { message: 'unknown assumption S-7' },
      { change: 0, message: 'unknown ticket nope' },
      { change: 1, message: 'duplicate ref "x"' },
      { change: 2, message: `${d.key} is done: use reopen` },
      { change: 3, message: 'this blocking edge would create a cycle' },
      { change: 4, message: `${r.key} is still open: only done or cancelled tickets can be reopened` },
      { change: 5, message: 'unknown decision D-9' },
    ]);
  });

  it('asks challenge-destination for a reason and a new destination', async () => {
    const { a, map, t } = await mission();
    const snap = await a.loadMap(map.id);
    const bare = validateReplan(snap, [], {
      ...draft([{ op: 'cancel_ticket', ticket: t.id, reason: 'exists' }]),
      kind: 'challenge-destination',
    });
    expect(bare.map((x) => x.message)).toEqual([
      'challenge-destination needs a reason: already-exists, wrong-problem or rescope',
      'challenge-destination needs an update_destination change with the suggested destination',
    ]);
    const ok = validateReplan(snap, [], {
      ...draft([{ op: 'update_destination', text: 'Use the existing export job' }]),
      kind: 'challenge-destination',
      destinationReason: 'already-exists',
    });
    expect(ok).toEqual([]);
  });
});

describe('replanDiff and freezing', () => {
  it('marks every ticket and shows new edges and lines', async () => {
    const { a, map, r, e, t, d } = await mission();
    const changes: ReplanChange[] = [
      { op: 'cancel_ticket', ticket: e.id, reason: 'no batch API' },
      { op: 'add_ticket', ref: 'q', title: 'Queue writes', type: 'execute', blockedBy: [r.id] },
      { op: 'rewire', ticket: t.id, addBlockedBy: ['q'] },
      { op: 'reopen', ticket: d.id, reason: 'needs a second look' },
      { op: 'add_out_of_scope', text: 'Batch endpoint' },
    ];
    const diff = replanDiff(await a.loadMap(map.id), changes);
    expect(diff.nodes.map((n) => `${n.key ?? n.id} ${n.mark} ${n.newEdges.join(',')}`)).toEqual([
      `${r.key} unchanged `,
      `${e.key} cancelled `,
      `${t.key} rewired q`,
      `${d.key} unchanged `,
      `q added ${r.id}`,
      `reopen:${d.id} reopened `,
    ]);
    expect(diff.outOfScope).toEqual(['Batch endpoint']);
    const p = { status: 'pending', id: 'R-1', changes } as ReplanProposal;
    expect([...frozenTickets([p, { ...p, id: 'R-2', status: 'rejected' }])]).toEqual([
      [e.id, 'R-1'],
      [t.id, 'R-1'],
    ]);
  });
});

/** Records mutating calls, and fails the Nth createTicket once, after it landed. */
function instrumented(inner: TrackerAdapter, failCreateAt?: number) {
  const calls: string[] = [];
  let creates = 0;
  const writes = [
    'createMap',
    'updateMapSections',
    'createTicket',
    'addBlocking',
    'assign',
    'comment',
    'close',
    'setMeta',
    'createDecision',
    'markSuperseded',
  ];
  return {
    calls,
    adapter: new Proxy(inner, {
      get(target, prop, recv) {
        const v = Reflect.get(target, prop, recv);
        if (typeof v !== 'function' || !writes.includes(String(prop)))
          return typeof v === 'function' ? v.bind(target) : v;
        return async (...args: unknown[]) => {
          calls.push(String(prop));
          const out = await v.apply(target, args);
          if (prop === 'createTicket' && ++creates === failCreateAt) throw new Error('crash after create');
          return out;
        };
      },
    }) as TrackerAdapter,
  };
}

describe('propose, approve and apply', () => {
  it('changes nothing until approved, then applies, journals and keeps the invalidated assumption as knowledge', async () => {
    const m = await mission();
    const spy = instrumented(m.a);
    const env = { root, adapter: spy.adapter, journal: journalFile(root) };
    await challengeAssumption(m.a, m.map.id, { assumption: 'S-1', evidence: 'no batch endpoint', by: 'codex-02' });
    const changes: ReplanChange[] = [
      { op: 'cancel_ticket', ticket: m.e.id, reason: 'no batch API' },
      { op: 'add_ticket', ref: 'q', title: 'Queue writes', type: 'execute', blockedBy: [m.r.id] },
      { op: 'add_ticket', ref: 'f', title: 'Flush the queue', type: 'task', blockedBy: ['q'] },
    ];
    const r = await proposeReplan(env, { ...draft(changes), invalidates: ['S-1'], mapId: m.map.id, by: 'codex-02' });
    expect(r.frozen).toEqual([m.e.id]);
    expect(spy.calls).toEqual([]);
    await expect(rejectReplan(env, { mapId: m.map.id, id: r.proposal.id, by: 'operator' })).rejects.toThrow(/say why/);

    const done = await approveReplan(env, { mapId: m.map.id, id: r.proposal.id, by: 'operator' });
    expect(done).toMatchObject({ status: 'approved', applied: [0, 1, 2] });
    const snap = await m.a.loadMap(m.map.id);
    const q = snap.tickets.find((t) => t.title === 'Queue writes')!;
    const f = snap.tickets.find((t) => t.title === 'Flush the queue')!;
    expect(f.blockedBy).toEqual([q.id]);
    expect(q.blockedBy).toEqual([m.r.id]);
    expect(snap.tickets.find((t) => t.id === m.e.id)).toMatchObject({ state: 'closed', closeReason: 'not_planned' });
    expect(snap.map.sections.assumptions![0]).toMatchObject({ status: 'invalidated', decidedBy: 'R-1' });
    expect(listKnowledge(root)).toMatchObject([
      { kind: 'dead-end', status: 'suggested', title: "Didn't hold: The v2 API supports batch writes" },
    ]);
    const steps = journalFile(root)
      .readAll(m.map.id)
      .map((e) => (e.kind === 'replan' ? e.action : e.event));
    expect(steps).toEqual(['proposed', 'approved', 'cancel', 'applied']);
  });

  it('resumes an interrupted apply without duplicate tickets', async () => {
    const m = await mission();
    const crashing = instrumented(m.a, 2);
    const env = { root, adapter: m.a, journal: journalFile(root) };
    const changes: ReplanChange[] = [
      { op: 'add_ticket', ref: 'q', title: 'Queue writes', type: 'execute', blockedBy: [m.r.id] },
      { op: 'add_ticket', ref: 'f', title: 'Flush the queue', type: 'task', blockedBy: ['q'] },
      { op: 'reopen', ticket: m.d.id, reason: 'look again' },
    ];
    const { proposal } = await proposeReplan(env, { ...draft(changes), mapId: m.map.id, by: 'codex-02' });
    const approved = { ...proposal, status: 'approved' as const };
    const save = (p: ReplanProposal) => writeReplan(root, p);
    await expect(applyReplan({ adapter: crashing.adapter, actor: 'operator', save }, approved)).rejects.toThrow(
      /crash/,
    );
    const saved = readReplan(root, m.map.id, proposal.id)!;
    expect(Object.keys(saved.created)).toEqual(['0']);
    const finished = await applyReplan({ adapter: m.a, actor: 'operator', save }, saved);
    expect(finished.applied).toEqual([0, 1, 2]);
    const titles = (await m.a.loadMap(m.map.id)).tickets.map((t) => t.title);
    expect(titles.filter((t) => t === 'Flush the queue')).toHaveLength(1);
    expect(titles).toContain(`Reopen ${m.d.key}: Old spike`);
    await applyReplan({ adapter: m.a, actor: 'operator', save }, finished);
    expect((await m.a.loadMap(m.map.id)).tickets).toHaveLength(7);
  });

  it('supersedes the same agent’s pending proposal; rejecting puts challenged assumptions back', async () => {
    const m = await mission();
    const env = { root, adapter: m.a, journal: journalFile(root) };
    await challengeAssumption(m.a, m.map.id, { assumption: 'S-1', evidence: 'x', by: 'codex-02' });
    const base = { mapId: m.map.id, by: 'codex-02', invalidates: ['S-1'] };
    const first = await proposeReplan(env, { ...draft([{ op: 'add_unspecified', text: 'Batch size' }]), ...base });
    const second = await proposeReplan(env, { ...draft([{ op: 'add_unspecified', text: 'Queue size' }]), ...base });
    expect(readReplan(root, m.map.id, first.proposal.id)).toMatchObject({
      status: 'superseded',
      supersededBy: second.proposal.id,
    });
    await rejectReplan(env, { mapId: m.map.id, id: second.proposal.id, by: 'operator', note: 'keep batching' });
    expect((await m.a.loadMap(m.map.id)).map.sections.assumptions![0].status).toBe('holding');
    await expect(approveReplan(env, { mapId: m.map.id, id: second.proposal.id, by: 'operator' })).rejects.toThrow(
      /rejected/,
    );
  });
});

describe('replanTriggers', () => {
  it('suggest a replan from the signals already in the tracker, deterministically', async () => {
    const m = await mission();
    await ruleOutOfScope(m.a, m.map.id, { ticketId: m.e.id }, { reason: 'dropped', author: 'operator' });
    const snap = await m.a.loadMap(m.map.id);
    const decisions = await m.a.listDecisions(m.map.id);
    const input = { snap, decisions, closedUnmerged: [m.r.id] };
    const out = replanTriggers(input);
    expect(out.map((s) => s.id)).toEqual([`cancelled-with-dependents:${m.e.id}`, `pr-closed-unmerged:${m.r.id}`]);
    expect(out[0].reason).toBe(`${m.e.key} was cancelled, but ${m.t.key} still depends on it`);
    expect(replanTriggers(input)).toEqual(out);
  });
});
