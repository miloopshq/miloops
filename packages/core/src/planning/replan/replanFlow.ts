import type { TrackerAdapter } from '../../adapters/adapter';
import type { ActorKind, JournalEntry, ReplanAction } from '../../model/lifecycle';
import type { ReplanError, ReplanProposal } from '../../model/replan';
import { OperationError } from '../operations/operationError';
import { frozenTickets } from './frozenTickets';
import { replanDiff } from './replanDiff';
import { createReplan, listReplans, writeReplan } from './replanStore';
import { validateReplan, type ReplanDraft } from './validateReplan';

/** Where replan steps run: the tracker folder, the active adapter and the mission journal. */
export interface ReplanEnv {
  root: string;
  adapter: TrackerAdapter;
  /** The mission history (`journalFile`): replan steps and the transitions applying them. */
  journal: { append(entry: JournalEntry): void | Promise<void> };
}

/** A proposal the engine refused; `errors` name the change each problem is in. */
export class ReplanInvalid extends OperationError {
  constructor(readonly errors: ReplanError[]) {
    super(
      `the proposal has ${errors.length} problem${errors.length === 1 ? '' : 's'}: ${errors.map(errorLine).join('; ')}`,
    );
  }
}

const errorLine = (e: ReplanError) => (e.change === undefined ? e.message : `change ${e.change + 1}: ${e.message}`);

export interface ProposeInput extends ReplanDraft {
  mapId: string;
  by: string;
  sessionId?: string;
  at?: number;
}

/**
 * Validates and stores a proposal, which freezes the tickets it touches until the operator decides. The same agent's
 * earlier pending proposal on the mission is superseded. Returns it with the dry-run diff and the frozen tickets.
 */
export async function proposeReplan(env: ReplanEnv, input: ProposeInput) {
  const snap = await env.adapter.loadMap(input.mapId);
  const decisions = await env.adapter.listDecisions(input.mapId);
  const errors = validateReplan(snap, decisions, input);
  if (errors.length) throw new ReplanInvalid(errors);
  const at = input.at ?? Date.now();
  const proposal = createReplan(env.root, {
    v: 1,
    mapId: input.mapId,
    kind: input.kind,
    ...(input.kind === 'challenge-destination' ? { destinationReason: input.destinationReason } : {}),
    by: input.by,
    sessionId: input.sessionId,
    at,
    reason: input.reason.trim(),
    evidence: input.evidence.trim(),
    invalidates: input.invalidates,
    changes: input.changes,
    status: 'pending',
    applied: [],
    created: {},
  });
  journal(env, proposal, { action: 'proposed', actor: input.by, actorKind: 'agent', reason: proposal.reason });
  for (const old of listReplans(env.root, input.mapId)) {
    if (old.id === proposal.id || old.by !== input.by || old.status !== 'pending') continue;
    writeReplan(env.root, { ...old, status: 'superseded', supersededBy: proposal.id, decidedAt: at });
    journal(env, old, { action: 'superseded', actor: input.by, actorKind: 'agent', reason: `by ${proposal.id}` });
  }
  return { proposal, ...replanView(env.root, snap, proposal) };
}

/** The dry-run diff and the tickets the mission's pending proposals freeze. */
export function replanView(root: string, snap: Parameters<typeof replanDiff>[0], p: ReplanProposal) {
  const frozen = frozenTickets(listReplans(root, p.mapId));
  const mine = [...frozen].filter(([, id]) => id === p.id).map(([ticket]) => ticket);
  return { diff: replanDiff(snap, p.changes), frozen: mine };
}

/** Appends a replan step to the mission's history. */
export function journal(
  env: Pick<ReplanEnv, 'journal'>,
  p: ReplanProposal,
  step: { action: ReplanAction; actor: string; actorKind: ActorKind; reason?: string; changes?: number },
) {
  void env.journal.append({
    v: 1,
    kind: 'replan',
    at: Date.now(),
    mapId: p.mapId,
    replanId: p.id,
    action: step.action,
    actor: step.actor,
    actorKind: step.actorKind,
    ...(step.reason ? { reason: step.reason } : {}),
    ...(step.changes !== undefined ? { changes: step.changes } : {}),
  });
}
