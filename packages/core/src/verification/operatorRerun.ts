import { ticketPhase } from '../planning/lifecycle/phase';
import { transition } from '../planning/lifecycle/transition';
import { OperationError } from '../planning/operations/operationError';
import { readAttempts } from './evidenceStore';
import { levelFor, verify, type VerifyEnv } from './verifyCompletion';

/**
 * The operator runs a ticket's checks again on its last submission: a verifying
 * ticket is re-verified, a blocked one goes back to verifying first. Returns once
 * the run has started; `done` settles with the outcome.
 */
export async function rerunChecks(env: VerifyEnv, mapId: string, ticketId: string, by: string, reason?: string) {
  const snap = await env.adapter.loadMap(mapId);
  const t = snap.tickets.find((x) => x.id === ticketId);
  if (!t) throw new OperationError(`ticket ${ticketId} not found`);
  const last = readAttempts(env.root, mapId, ticketId).at(-1);
  if (!last) throw new OperationError(`${t.key} has no submission to verify again`);
  const phase = ticketPhase(t, new Map(snap.tickets.map((x) => [x.id, x])), snap.map.mode);
  if (phase !== 'verifying' && phase !== 'blocked')
    throw new OperationError(`${t.key} is ${phase}; only verifying or blocked tickets can be re-run`);
  const actor = { actor: by, actorKind: 'operator' as const, reason: reason || 'checks re-run by the operator' };
  await transition(
    env.adapter,
    mapId,
    ticketId,
    phase === 'blocked'
      ? { ...actor, event: 'unblock', to: 'verifying', expect: 'blocked' }
      : { ...actor, event: 'reverify', expect: 'verifying' },
    { journal: env.journal },
  );
  const { info } = levelFor(env.root, snap, t);
  return verify(env, mapId, { ...t, status: 'verifying' }, info, {
    agent: last.agent,
    sessionId: last.sessionId,
    resolution: last.resolution,
    summary: last.summary,
    rationale: last.rationale,
    alternatives: last.alternatives,
    noCodeReason: last.noCodeReason,
    pr: last.pr,
  });
}
