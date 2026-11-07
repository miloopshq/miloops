import type { TrackerAdapter } from '../../adapters/adapter';
import type { ActorKind, JournalEntry, RerouteAction } from '../../model/lifecycle';
import type { RerouteError, RerouteProposal } from '../../model/reroute';
import { OperationError } from '../operations/operationError';
import { frozenTickets } from './frozenTickets';
import { rerouteDiff } from './rerouteDiff';
import { createReroute, listReroutes, writeReroute } from './rerouteStore';
import { validateReroute, type RerouteDraft } from './validateReroute';

/** Where reroute steps run: the tracker folder, the active adapter and the trail journal. */
export interface RerouteEnv {
  root: string;
  adapter: TrackerAdapter;
  /** The trail history (`journalFile`): reroute steps and the transitions applying them. */
  journal: { append(entry: JournalEntry): void | Promise<void> };
}

/** A proposal the engine refused; `errors` name the change each problem is in. */
export class RerouteInvalid extends OperationError {
  constructor(readonly errors: RerouteError[]) {
    super(
      `the proposal has ${errors.length} problem${errors.length === 1 ? '' : 's'}: ${errors.map(errorLine).join('; ')}`,
    );
  }
}

const errorLine = (e: RerouteError) => (e.change === undefined ? e.message : `change ${e.change + 1}: ${e.message}`);

export interface ProposeInput extends RerouteDraft {
  mapId: string;
  by: string;
  sessionId?: string;
  at?: number;
}

/**
 * Validates and stores a proposal, which freezes the tickets it touches until the trail lead decides. The same agent's
 * earlier pending proposal on the trail is superseded. Returns it with the dry-run diff and the frozen tickets.
 */
export async function proposeReroute(env: RerouteEnv, input: ProposeInput) {
  const snap = await env.adapter.loadMap(input.mapId);
  const decisions = await env.adapter.listDecisions(input.mapId);
  const errors = validateReroute(snap, decisions, input);
  if (errors.length) throw new RerouteInvalid(errors);
  const at = input.at ?? Date.now();
  const proposal = createReroute(env.root, {
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
  for (const old of listReroutes(env.root, input.mapId)) {
    if (old.id === proposal.id || old.by !== input.by || old.status !== 'pending') continue;
    writeReroute(env.root, { ...old, status: 'superseded', supersededBy: proposal.id, decidedAt: at });
    journal(env, old, { action: 'superseded', actor: input.by, actorKind: 'agent', reason: `by ${proposal.id}` });
  }
  return { proposal, ...rerouteView(env.root, snap, proposal) };
}

/** The dry-run diff and the tickets the trail's pending proposals freeze. */
export function rerouteView(root: string, snap: Parameters<typeof rerouteDiff>[0], p: RerouteProposal) {
  const frozen = frozenTickets(listReroutes(root, p.mapId));
  const mine = [...frozen].filter(([, id]) => id === p.id).map(([ticket]) => ticket);
  return { diff: rerouteDiff(snap, p.changes), frozen: mine };
}

/** Appends a reroute step to the trail's history. */
export function journal(
  env: Pick<RerouteEnv, 'journal'>,
  p: RerouteProposal,
  step: { action: RerouteAction; actor: string; actorKind: ActorKind; reason?: string; changes?: number },
) {
  void env.journal.append({
    v: 1,
    kind: 'reroute',
    at: Date.now(),
    mapId: p.mapId,
    rerouteId: p.id,
    action: step.action,
    actor: step.actor,
    actorKind: step.actorKind,
    ...(step.reason ? { reason: step.reason } : {}),
    ...(step.changes !== undefined ? { changes: step.changes } : {}),
  });
}
