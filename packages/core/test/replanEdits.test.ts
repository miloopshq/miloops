import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chartMap,
  MemoryAdapter,
  replanDiff,
  resolve,
  validateReplan,
  type ReplanChange,
  type ReplanProposal,
  type TrackerAdapter,
} from '../src';
import { journalFile } from '../src/history/journalFile';
import { applyReplan } from '../src/planning/replan/applyReplan';

let root: string;
beforeEach(() => (root = fs.mkdtempSync(path.join(os.tmpdir(), 'miloops-replan-edits-'))));
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** research r → execute e → task t, plus a done research d. */
async function mission() {
  const a = new MemoryAdapter({ latency: [0, 0] });
  const { map, tickets } = await chartMap(a, {
    title: 'Batch sync',
    sections: { destination: 'Sync in batches', notes: '', decisions: [], unspecified: [], outOfScope: [] },
    tickets: [
      { ref: 'r', title: 'Check the v2 API', type: 'research', body: '' },
      { ref: 'e', title: 'Batch writes', type: 'execute', body: 'Use the batch endpoint', blockedBy: ['r'] },
      { ref: 't', title: 'Roll out', type: 'task', body: '', blockedBy: ['e'] },
      { ref: 'd', title: 'Old spike', type: 'research', body: '' },
    ],
  });
  const [r, e, t, d] = tickets;
  await resolve(a, map.id, d.id, { answer: 'Spiked it.', author: 'claude-01' });
  return { a, map, r, e, t, d };
}

const approved = (mapId: string, changes: ReplanChange[]): ReplanProposal => ({
  v: 1,
  id: 'R-1',
  mapId,
  kind: 'replan',
  by: 'codex-02',
  at: Date.now(),
  reason: 'v2 has no batch endpoint',
  evidence: 'docs/api.md',
  invalidates: [],
  changes,
  status: 'approved',
  applied: [],
  created: {},
});

/** Fails the first call of `method` once, after it landed (a crash between the write and the save). */
function crashOnce(inner: TrackerAdapter, method: keyof TrackerAdapter): TrackerAdapter {
  let crashed = false;
  return new Proxy(inner, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv);
      if (typeof v !== 'function') return v;
      if (prop !== method) return v.bind(target);
      return async (...args: unknown[]) => {
        const out = await v.apply(target, args);
        if (!crashed) {
          crashed = true;
          throw new Error('crash after write');
        }
        return out;
      };
    },
  });
}

describe('replan edits: validate and diff', () => {
  it('removing a dependency needs a real one; a removal can make room for the reverse edge', async () => {
    const { a, map, r, e, t } = await mission();
    const snap = await a.loadMap(map.id);
    const errors = validateReplan(snap, [], {
      kind: 'replan',
      reason: 'x',
      evidence: 'y',
      invalidates: [],
      changes: [
        { op: 'rewire', ticket: t.id, removeBlockedBy: [r.id] },
        { op: 'rewire', ticket: t.id },
        { op: 'rewire', ticket: e.id, removeBlockedBy: [r.id] },
        { op: 'rewire', ticket: r.id, addBlockedBy: [e.id] },
      ],
    });
    expect(errors).toEqual([
      { change: 0, message: `${r.key} does not block ${t.key}` },
      { change: 1, message: 'rewire needs "addBlockedBy" or "removeBlockedBy"' },
    ]);
  });

  it('shows removed edges and marks a reopened ticket on the real node', async () => {
    const { a, map, r, e, d } = await mission();
    const diff = replanDiff(await a.loadMap(map.id), [
      { op: 'rewire', ticket: e.id, removeBlockedBy: [r.id] },
      { op: 'reopen', ticket: d.id, reason: 'look again' },
    ]);
    const node = (id: string) => diff.nodes.find((n) => n.id === id)!;
    expect(node(e.id)).toMatchObject({ mark: 'rewired', blockedBy: [], removedEdges: [r.id] });
    expect(node(d.id).mark).toBe('reopened');
    expect(diff.nodes).toHaveLength(4);
  });
});

describe('replan edits: apply', () => {
  it('edits the ticket, removes the dependency and reopens the same ticket, journaled', async () => {
    const { a, map, r, e, d } = await mission();
    const journal = journalFile(root);
    const changes: ReplanChange[] = [
      { op: 'edit_ticket', ticket: e.id, title: 'Queue writes', body: 'Single-note PUTs, queued' },
      { op: 'rewire', ticket: e.id, removeBlockedBy: [r.id] },
      { op: 'reopen', ticket: d.id, reason: 'the spike missed rate limits' },
    ];
    const saved: ReplanProposal[] = [];
    const p = await applyReplan(
      { adapter: a, actor: 'operator', journal, save: (x) => void saved.push(x) },
      approved(map.id, changes),
    );
    expect(p.applied).toEqual([0, 1, 2]);
    const snap = await a.loadMap(map.id);
    const edited = snap.tickets.find((t) => t.id === e.id)!;
    expect(edited).toMatchObject({ title: 'Queue writes', body: 'Single-note PUTs, queued', blockedBy: [] });
    expect(edited.comments.map((c) => c.body)).toEqual(['Edited by replan R-1 (change 1), approved by operator.']);
    expect(snap.tickets.find((t) => t.id === d.id)?.state).toBe('open');
    expect(snap.tickets).toHaveLength(4);
    const reopen = (await journal.read(map.id)).find((x) => x.event === 'reopen');
    expect(reopen).toMatchObject({
      ticketId: d.id,
      from: 'done',
      to: 'ready',
      actor: 'operator',
      actorKind: 'operator',
    });
  });

  it('resumes after a crash mid-apply without editing or commenting twice', async () => {
    const { a, map, e, d } = await mission();
    const changes: ReplanChange[] = [
      { op: 'edit_ticket', ticket: e.id, title: 'Queue writes' },
      { op: 'reopen', ticket: d.id, reason: 'look again' },
    ];
    let last = approved(map.id, changes);
    const save = (x: ReplanProposal) => void (last = x);
    await expect(applyReplan({ adapter: crashOnce(a, 'editTicket'), actor: 'operator', save }, last)).rejects.toThrow(
      /crash/,
    );
    expect(last.applied).toEqual([]);
    const done = await applyReplan({ adapter: a, actor: 'operator', save }, last);
    expect(done.applied).toEqual([0, 1]);
    await applyReplan({ adapter: a, actor: 'operator', save }, done);
    const ticket = (await a.loadMap(map.id)).tickets.find((t) => t.id === e.id)!;
    expect(ticket.title).toBe('Queue writes');
    expect(ticket.comments).toHaveLength(1);
  });
});
