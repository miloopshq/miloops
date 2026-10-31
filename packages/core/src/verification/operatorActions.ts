import { staleAction } from '../evidence/stale';
import type { TicketPhase, VerificationLevel } from '../model/lifecycle';
import type { VerdictKind } from '../model/verification';
import { setVerification } from '../planning/lifecycle/setVerification';
import { transition } from '../planning/lifecycle/transition';
import { OperationError } from '../planning/operations/operationError';
import { resolve } from '../planning/operations/resolve';
import { DEFAULT_CONFIG } from './config';
import { readVerificationConfig } from './configFile';
import { readAttempts, writeVerdict } from './evidenceStore';
import { rerunChecks } from './operatorRerun';
import type { VerifyEnv } from './verifyCompletion';

export type OperatorAction = 'rerun' | 'approve' | 'accept' | 'rework' | 'unblock' | 'level';

export interface OperatorRequest {
  action: OperatorAction;
  mapId: string;
  /** Unset only for `level`, which then sets the mission level. */
  ticketId?: string;
  by: string;
  reason?: string;
  /** `unblock`: where the ticket goes. */
  to?: Extract<TicketPhase, 'ready' | 'rework'>;
  /** `level`: `null` clears it (the ticket follows the mission, the mission is off). */
  level?: VerificationLevel | null;
}

/** Actions that override what the checks or a reviewer found, so the operator must say why. */
const NEEDS_REASON = new Set<OperatorAction>(['accept', 'rework', 'unblock']);

/**
 * What the operator can do to a ticket under verification, from the command
 * center. Every state change goes through `transition()` as the operator, and
 * approvals, overrides and rework notes are kept as verdicts next to the attempts.
 */
export async function operatorAction(env: VerifyEnv, r: OperatorRequest): Promise<{ attemptId?: string }> {
  const reason = r.reason?.trim();
  if (NEEDS_REASON.has(r.action) && !reason) throw new OperationError(`${r.action} needs a reason`);
  if (r.action === 'level') {
    if (r.level === undefined) throw new OperationError('"level" is required');
    await setVerification(env.adapter, { mapId: r.mapId, ticketId: r.ticketId }, r.level, 'operator');
    return {};
  }
  if (!r.ticketId) throw new OperationError('"ticketId" is required');
  const ticketId = r.ticketId;
  const operator = { actor: r.by, actorKind: 'operator' as const, reason, journal: env.journal };
  const last = readAttempts(env.root, r.mapId, ticketId).at(-1);
  const verdict = (kind: VerdictKind, summary: string) => {
    if (last)
      writeVerdict(env.root, {
        v: 1,
        mapId: r.mapId,
        ticketId,
        attemptId: last.id,
        by: r.by,
        byKind: 'operator',
        verdict: kind,
        summary,
        findings: [],
        at: Date.now(),
      });
  };
  switch (r.action) {
    case 'rerun': {
      const run = await rerunChecks(env, r.mapId, ticketId, r.by, reason);
      void run.done.catch(() => {});
      return { attemptId: run.attemptId };
    }
    case 'approve':
    case 'accept': {
      const answer = last?.resolution ?? reason;
      if (!answer) throw new OperationError('nothing was submitted: say what is accepted');
      if (r.action === 'approve' && last) {
        const config = readVerificationConfig(env.root).config ?? DEFAULT_CONFIG;
        const s = await staleAction(env.root, config, last);
        if (s.action === 'reverify')
          throw new OperationError(`${last.id} no longer matches the code (${s.check.reason}): re-run checks first`);
      }
      await resolve(
        env.adapter,
        r.mapId,
        ticketId,
        { answer, summary: last?.summary, author: last?.agent ?? r.by },
        { ...operator, event: r.action },
      );
      verdict('PASS', reason ?? (r.action === 'approve' ? 'approved' : 'accepted'));
      return {};
    }
    case 'rework':
      await transition(env.adapter, r.mapId, ticketId, { ...operator, event: 'reject', to: 'rework' }, operator);
      await env.adapter.comment(r.mapId, ticketId, r.by, `**Sent back to rework**\n\n${reason}`);
      verdict('FAIL', reason!);
      return {};
    case 'unblock':
      if (r.to !== 'ready' && r.to !== 'rework') throw new OperationError('unblock needs "to": ready or rework');
      await transition(env.adapter, r.mapId, ticketId, { ...operator, event: 'unblock', to: r.to }, operator);
      return {};
  }
}
