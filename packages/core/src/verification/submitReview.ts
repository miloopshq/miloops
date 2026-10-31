import { staleAction } from '../evidence/stale';
import type { TicketPhase } from '../model/lifecycle';
import type { VerdictKind, VerificationVerdict } from '../model/verification';
import { ticketPhase } from '../planning/lifecycle/phase';
import { withdrawReviews } from '../planning/lifecycle/reviewTicket';
import { transition } from '../planning/lifecycle/transition';
import { OperationError } from '../planning/operations/operationError';
import { resolve } from '../planning/operations/resolve';
import { DEFAULT_CONFIG } from './config';
import { readAttempts, writeVerdict } from './evidenceStore';
import { submissionOf } from './resubmit';
import { reviewConflict, type Reviewer } from './reviewIndependence';
import { CHECK_RUNNER, levelFor, verify, type VerifyEnv } from './verifyCompletion';

export interface ReviewSubmission extends Reviewer {
  mapId: string;
  /** The review ticket the reviewer claimed. */
  reviewId: string;
  sessionId?: string;
  verdict: VerdictKind;
  summary: string;
  findings?: VerificationVerdict['findings'];
}

export interface ReviewResult {
  verdict: VerificationVerdict;
  /** Where the reviewed ticket went; `verifying` waits for the operator, or for checks run again on changed code. */
  phase: TicketPhase;
  /** Set when a PASS on code that changed since its checks ran started a new attempt. */
  attemptId?: string;
}

const findingLine = (f: VerificationVerdict['findings'][number]) =>
  `- ${f.severity}${f.path ? ` · \`${f.path}${f.line ? `:${f.line}` : ''}\`` : ''}: ${f.text}`;

/**
 * An agent's verdict on the work behind a review ticket. The verdict is kept
 * next to the attempt, the review ticket closes, and the reviewed ticket moves:
 * FAIL to rework, NEEDS_HUMAN to the operator, PASS to done (or to the
 * operator's approval at `checks+review+human`). A PASS on code that changed
 * since its checks passed runs them again instead, when `stale` is `reverify`.
 */
export async function submitReview(env: VerifyEnv, r: ReviewSubmission): Promise<ReviewResult> {
  const snap = await env.adapter.loadMap(r.mapId);
  const review = snap.tickets.find((x) => x.id === r.reviewId);
  if (!review || review.type !== 'review' || !review.reviewOf)
    throw new OperationError(`${review?.key ?? r.reviewId} is not a review ticket`);
  if (review.state !== 'open') throw new OperationError(`${review.key} is already closed`);
  if (review.assignee !== r.agent) throw new OperationError(`claim ${review.key} before reviewing it`);
  const t = snap.tickets.find((x) => x.id === review.reviewOf);
  const byId = new Map(snap.tickets.map((x) => [x.id, x]));
  if (!t || ticketPhase(t, byId, snap.map.mode) !== 'verifying') {
    if (t) await withdrawReviews(env.adapter, snap, t.id, { actor: CHECK_RUNNER, reason: `${t.key} left review` });
    throw new OperationError(`${t?.key ?? review.reviewOf} is no longer waiting for review`);
  }
  const conflict = reviewConflict(env.root, r.mapId, t, r);
  if (conflict) throw new OperationError(conflict);
  const last = readAttempts(env.root, r.mapId, t.id).at(-1);
  if (last?.result !== 'pass') throw new OperationError(`${t.key} has no passing attempt to review`);
  const summary = r.summary.trim();
  if (!summary) throw new OperationError('a review needs a summary');

  const verdict = writeVerdict(env.root, {
    v: 1,
    mapId: r.mapId,
    ticketId: t.id,
    attemptId: last.id,
    by: r.agent,
    byKind: 'agent',
    ...(r.sessionId ? { sessionId: r.sessionId } : {}),
    verdict: r.verdict,
    summary,
    findings: r.findings ?? [],
    at: Date.now(),
  });
  const findings = verdict.findings.map(findingLine);
  await env.adapter.comment(
    r.mapId,
    t.id,
    r.agent,
    [
      `**Review ${verdict.id} of ${last.id}: ${r.verdict}**`,
      '',
      summary,
      ...(findings.length ? ['', ...findings] : []),
    ].join('\n'),
  );
  const opts = { journal: env.journal };
  await transition(
    env.adapter,
    r.mapId,
    review.id,
    {
      event: 'complete',
      actor: r.agent,
      actorKind: 'agent',
      reason: `${verdict.id}: ${r.verdict}`,
      sessionId: r.sessionId,
    },
    opts,
  );
  const engine = {
    actor: CHECK_RUNNER,
    actorKind: 'engine' as const,
    reason: `${verdict.id} by ${r.agent}: ${r.verdict}`,
    sessionId: last.sessionId,
    expect: 'verifying' as const,
  };
  if (r.verdict === 'FAIL') {
    await transition(env.adapter, r.mapId, t.id, { ...engine, event: 'review.fail', to: 'rework' }, opts);
    return { verdict, phase: 'rework' };
  }
  if (r.verdict === 'NEEDS_HUMAN') {
    await transition(env.adapter, r.mapId, t.id, { ...engine, event: 'review.needs_human', to: 'blocked' }, opts);
    return { verdict, phase: 'blocked' };
  }
  const { info, config } = levelFor(env.root, snap, t);
  const stale = await staleAction(env.root, config.config ?? DEFAULT_CONFIG, last);
  if (stale.action === 'reverify') {
    await transition(env.adapter, r.mapId, t.id, { ...engine, event: 'reverify', reason: stale.check.reason }, opts);
    const run = await verify(env, r.mapId, t, info, submissionOf(last));
    void run.done.catch(() => {});
    return { verdict, phase: 'verifying', attemptId: run.attemptId };
  }
  if (info.level === 'checks+review+human') {
    await transition(env.adapter, r.mapId, t.id, { ...engine, event: 'review.pass', to: 'verifying' }, opts);
    return { verdict, phase: 'verifying' };
  }
  await resolve(
    env.adapter,
    r.mapId,
    t.id,
    { answer: last.resolution, summary: last.summary, author: last.agent },
    { ...engine, event: 'review.pass', journal: env.journal },
  );
  return { verdict, phase: 'done' };
}
