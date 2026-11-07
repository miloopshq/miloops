import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chartMap,
  frozenTickets,
  MemoryAdapter,
  rerouteDiff,
  rerouteTriggers,
  resolve,
  ruleOutOfScope,
  validateReroute,
  type RerouteChange,
  type RerouteProposal,
  type TrackerAdapter,
} from '../src';
import { journalFile } from '../src/history/journalFile';
import { listKnowledge } from '../src/knowledge/knowledgeStore';
import { addAssumptions, challengeAssumption } from '../src/planning/assumptions/assumptionOps';
import { applyReroute } from '../src/planning/reroute/applyReroute';
import { approveReroute, rejectReroute } from '../src/planning/reroute/decideReroute';
import { proposeReroute } from '../src/planning/reroute/rerouteFlow';
import { readReroute, writeReroute } from '../src/planning/reroute/rerouteStore';

let root: string;
beforeEach(() => (root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-reroute-'))));
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** research #1 → execute #2 → task #3, plus a done research #4. */
async function trail(a: TrackerAdapter = new MemoryAdapter({ latency: [0, 0] })) {
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

const draft = (changes: RerouteChange[], extra: Partial<RerouteProposal> = {}) => ({
  kind: 'reroute' as const,
  reason: 'v2 has no batch endpoint',
  evidence: 'docs/api.md: POST /items only',
  invalidates: [],
  changes,
  ...extra,
});

describe('validateReroute', () => {
  it('reports every problem with its change index', async () => {
    const { a, map, r, e, d } = await trail();
    const snap = await a.loadMap(map.id);
    const errors = validateReroute(snap, [], {
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
    const { a, map, t } = await trail();
    const snap = await a.loadMap(map.id);
    const bare = validateReroute(snap, [], {
      ...draft([{ op: 'cancel_ticket', ticket: t.id, reason: 'exists' }]),
      kind: 'challenge-destination',
    });
    expect(bare.map((x) => x.message)).toEqual([
      'challenge-destination needs a reason: already-exists, wrong-problem or rescope',
      'challenge-destination needs an update_destination change with the suggested destination',
    ]);
    const ok = validateReroute(snap, [], {
      ...draft([{ op: 'update_destination', text: 'Use the existing export job' }]),
      kind: 'challenge-destination',
      destinationReason: 'already-exists',
    });
    expect(ok).toEqual([]);
  });
});

describe('rerouteDiff and freezing', () => {
  it('marks every ticket and shows new edges and lines', async () => {
    const { a, map, r, e, t, d } = await trail();
    const changes: RerouteChange[] = [
      { op: 'cancel_ticket', ticket: e.id, reason: 'no batch API' },
      { op: 'add_ticket', ref: 'q', title: 'Queue writes', type: 'execute', blockedBy: [r.id] },
      { op: 'rewire', ticket: t.id, addBlockedBy: ['q'] },
      { op: 'reopen', ticket: d.id, reason: 'needs a second look' },
      { op: 'add_out_of_scope', text: 'Batch endpoint' },
    ];
    const diff = rerouteDiff(await a.loadMap(map.id), changes);
    expect(diff.nodes.map((n) => `${n.key ?? n.id} ${n.mark} ${n.newEdges.join(',')}`)).toEqual([
      `${r.key} unchanged `,
      `${e.key} cancelled `,
      `${t.key} rewired q`,
      `${d.key} reopened `,
      `q added ${r.id}`,
    ]);
    expect(diff.outOfScope).toEqual(['Batch endpoint']);
    const p = { status: 'pending', id: 'R-1', changes } as RerouteProposal;
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
    'removeBlocking',
    'editTicket',
    'assign',
    'comment',
    'close',
    'reopen',
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
    const m = await trail();
    const spy = instrumented(m.a);
    const env = { root, adapter: spy.adapter, journal: journalFile(root) };
    await challengeAssumption(m.a, m.map.id, { assumption: 'S-1', evidence: 'no batch endpoint', by: 'codex-02' });
    const changes: RerouteChange[] = [
      { op: 'cancel_ticket', ticket: m.e.id, reason: 'no batch API' },
      { op: 'add_ticket', ref: 'q', title: 'Queue writes', type: 'execute', blockedBy: [m.r.id] },
      { op: 'add_ticket', ref: 'f', title: 'Flush the queue', type: 'task', blockedBy: ['q'] },
    ];
    const r = await proposeReroute(env, { ...draft(changes), invalidates: ['S-1'], mapId: m.map.id, by: 'codex-02' });
    expect(r.frozen).toEqual([m.e.id]);
    expect(spy.calls).toEqual([]);
    await expect(rejectReroute(env, { mapId: m.map.id, id: r.proposal.id, by: 'trail lead' })).rejects.toThrow(
      /say why/,
    );

    const done = await approveReroute(env, { mapId: m.map.id, id: r.proposal.id, by: 'trail lead' });
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
      .map((e) => (e.kind === 'reroute' ? e.action : e.event));
    expect(steps).toEqual(['proposed', 'approved', 'cancel', 'applied']);
  });

  it('resumes an interrupted apply without duplicate tickets', async () => {
    const m = await trail();
    const crashing = instrumented(m.a, 2);
    const env = { root, adapter: m.a, journal: journalFile(root) };
    const changes: RerouteChange[] = [
      { op: 'add_ticket', ref: 'q', title: 'Queue writes', type: 'execute', blockedBy: [m.r.id] },
      { op: 'add_ticket', ref: 'f', title: 'Flush the queue', type: 'task', blockedBy: ['q'] },
      { op: 'reopen', ticket: m.d.id, reason: 'look again' },
    ];
    const { proposal } = await proposeReroute(env, { ...draft(changes), mapId: m.map.id, by: 'codex-02' });
    const approved = { ...proposal, status: 'approved' as const };
    const save = (p: RerouteProposal) => writeReroute(root, p);
    await expect(applyReroute({ adapter: crashing.adapter, actor: 'trail lead', save }, approved)).rejects.toThrow(
      /crash/,
    );
    const saved = readReroute(root, m.map.id, proposal.id)!;
    expect(Object.keys(saved.created)).toEqual(['0']);
    const finished = await applyReroute({ adapter: m.a, actor: 'trail lead', save }, saved);
    expect(finished.applied).toEqual([0, 1, 2]);
    const after = (await m.a.loadMap(m.map.id)).tickets;
    expect(after.map((t) => t.title).filter((t) => t === 'Flush the queue')).toHaveLength(1);
    expect(after.find((t) => t.id === m.d.id)?.state).toBe('open');
    await applyReroute({ adapter: m.a, actor: 'trail lead', save }, finished);
    expect((await m.a.loadMap(m.map.id)).tickets).toHaveLength(6);
  });

  it('supersedes the same agent’s pending proposal; rejecting puts challenged assumptions back', async () => {
    const m = await trail();
    const env = { root, adapter: m.a, journal: journalFile(root) };
    await challengeAssumption(m.a, m.map.id, { assumption: 'S-1', evidence: 'x', by: 'codex-02' });
    const base = { mapId: m.map.id, by: 'codex-02', invalidates: ['S-1'] };
    const first = await proposeReroute(env, { ...draft([{ op: 'add_unspecified', text: 'Batch size' }]), ...base });
    const second = await proposeReroute(env, { ...draft([{ op: 'add_unspecified', text: 'Queue size' }]), ...base });
    expect(readReroute(root, m.map.id, first.proposal.id)).toMatchObject({
      status: 'superseded',
      supersededBy: second.proposal.id,
    });
    await rejectReroute(env, { mapId: m.map.id, id: second.proposal.id, by: 'trail lead', note: 'keep batching' });
    expect((await m.a.loadMap(m.map.id)).map.sections.assumptions![0].status).toBe('holding');
    await expect(approveReroute(env, { mapId: m.map.id, id: second.proposal.id, by: 'trail lead' })).rejects.toThrow(
      /rejected/,
    );
  });
});

describe('rerouteTriggers', () => {
  it('suggest a reroute from the signals already in the tracker, deterministically', async () => {
    const m = await trail();
    await ruleOutOfScope(m.a, m.map.id, { ticketId: m.e.id }, { reason: 'dropped', author: 'trail lead' });
    const snap = await m.a.loadMap(m.map.id);
    const decisions = await m.a.listDecisions(m.map.id);
    const input = { snap, decisions, closedUnmerged: [m.r.id] };
    const out = rerouteTriggers(input);
    expect(out.map((s) => s.id)).toEqual([`cancelled-with-dependents:${m.e.id}`, `pr-closed-unmerged:${m.r.id}`]);
    expect(out[0].reason).toBe(`${m.e.key} was cancelled, but ${m.t.key} still depends on it`);
    expect(rerouteTriggers(input)).toEqual(out);
  });
});
