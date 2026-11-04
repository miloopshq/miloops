import { listKnowledge, nextKnowledgeId, writeKnowledge } from '../../knowledge/knowledgeStore';
import type { Assumption } from '../../model/assumption';
import type { ReplanProposal } from '../../model/replan';
import { settleAssumptions } from '../assumptions/assumptionOps';
import { OperationError } from '../operations/operationError';
import { applyReplan } from './applyReplan';
import { journal, ReplanInvalid, type ReplanEnv } from './replanFlow';
import { readReplan, writeReplan } from './replanStore';
import { validateReplan } from './validateReplan';

export interface ReplanDecision {
  mapId: string;
  id: string;
  /** The operator's actor id. */
  by: string;
  note?: string;
  now?: number;
}

/**
 * The operator approves a proposal: it is checked again against the map as it is now, marked approved, applied
 * through the existing operations (resumable), and the assumptions it invalidates are settled and kept as suggested
 * `dead-end` knowledge. Approving an approved proposal that didn't finish applying finishes it.
 */
export async function approveReplan(env: ReplanEnv, d: ReplanDecision): Promise<ReplanProposal> {
  const found = readOrThrow(env, d);
  const resuming = found.status === 'approved' && found.applied.length < found.changes.length;
  if (found.status !== 'pending' && !resuming) throw new OperationError(`${found.id} is ${found.status}`);
  let p = found;
  if (!resuming) {
    const snap = await env.adapter.loadMap(d.mapId);
    const errors = validateReplan(snap, await env.adapter.listDecisions(d.mapId), p);
    if (errors.length) throw new ReplanInvalid(errors);
    p = {
      ...p,
      status: 'approved',
      decidedBy: d.by,
      decidedAt: d.now ?? Date.now(),
      note: d.note?.trim() || undefined,
    };
    writeReplan(env.root, p);
    journal(env, p, { action: 'approved', actor: d.by, actorKind: 'operator', reason: p.note });
  }
  p = await applyReplan(
    { adapter: env.adapter, actor: d.by, journal: env.journal, save: (x) => writeReplan(env.root, x) },
    p,
  );
  journal(env, p, { action: 'applied', actor: d.by, actorKind: 'operator', changes: p.applied.length });
  const invalidated = await settleAssumptions(env.adapter, d.mapId, {
    ids: p.invalidates,
    status: 'invalidated',
    replanId: p.id,
  });
  keepAsKnowledge(env, p, invalidated);
  return p;
}

/** The operator rejects a proposal, with the note the agent gets; challenged assumptions it listed hold again. */
export async function rejectReplan(env: ReplanEnv, d: ReplanDecision): Promise<ReplanProposal> {
  const note = d.note?.trim();
  if (!note) throw new OperationError('say why: the note goes back to the agent');
  const found = readOrThrow(env, d);
  if (found.status !== 'pending') throw new OperationError(`${found.id} is ${found.status}`);
  const p: ReplanProposal = { ...found, status: 'rejected', decidedBy: d.by, decidedAt: d.now ?? Date.now(), note };
  writeReplan(env.root, p);
  journal(env, p, { action: 'rejected', actor: d.by, actorKind: 'operator', reason: note });
  await settleAssumptions(env.adapter, d.mapId, { ids: p.invalidates, status: 'holding', replanId: p.id });
  return p;
}

function readOrThrow(env: ReplanEnv, d: Pick<ReplanDecision, 'mapId' | 'id'>) {
  const p = readReplan(env.root, d.mapId, d.id);
  if (!p) throw new OperationError(`no proposal ${d.id} on this mission`);
  return p;
}

/** Each invalidated assumption becomes a suggested `dead-end` entry the operator can review; never twice. */
function keepAsKnowledge(env: ReplanEnv, p: ReplanProposal, invalidated: Assumption[]) {
  const existing = new Set(listKnowledge(env.root).flatMap((e) => e.sources));
  for (const a of invalidated) {
    const source = `replan:${p.mapId}/${p.id}/${a.id}`;
    if (existing.has(source)) continue;
    const now = Date.now();
    writeKnowledge(env.root, {
      id: nextKnowledgeId(env.root),
      title: `Didn't hold: ${a.text}`.slice(0, 160),
      body: [`The mission assumed: ${a.text}`, `Why it doesn't hold: ${p.reason}`, `Evidence: ${p.evidence}`].join(
        '\n\n',
      ),
      kind: 'dead-end',
      status: 'suggested',
      scope: [],
      tags: ['assumption'],
      sources: [source],
      anchors: [],
      createdBy: p.by,
      createdAt: now,
      updatedAt: now,
    });
  }
}
