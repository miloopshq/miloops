import { OperationError, type MapSnapshot, type Ticket, type VerificationVerdict } from '@miloops-hq/core';
import { reviewConflict, submitReview } from '@miloops-hq/core/agents';
import type { AgentContext } from './agentContext';

/** Why this agent may not take review ticket `r`, or undefined. */
function conflictOf(ctx: AgentContext, snap: MapSnapshot, r: Ticket, agent: string) {
  const t = snap.tickets.find((x) => x.id === r.reviewOf);
  return t ? reviewConflict(ctx.root, snap.map.id, t, { agent, sessionIds: ctx.sessionIds }) : undefined;
}

/** Review tickets of work this agent did: never offered to it. */
export const ownReviews = (ctx: AgentContext, snap: MapSnapshot, agent: string) =>
  snap.tickets
    .filter((r) => r.type === 'review' && r.state === 'open' && conflictOf(ctx, snap, r, agent))
    .map((r) => r.id);

export function assertMayReview(ctx: AgentContext, snap: MapSnapshot, t: Ticket, agent: string) {
  const conflict = t.type === 'review' ? conflictOf(ctx, snap, t, agent) : undefined;
  if (conflict) throw new OperationError(`You cannot take ${t.key}: ${conflict}.`);
}

export async function submitReviewTool(
  ctx: AgentContext,
  input: {
    mission?: string;
    ticket?: string;
    verdict: VerificationVerdict['verdict'];
    summary: string;
    findings?: VerificationVerdict['findings'];
  },
) {
  const s = ctx.sessions.running();
  const snap = await ctx.resolveMission(input.mission ?? (s?.info.mapId || undefined));
  const ref = input.ticket ?? (s?.info.mapId === snap.map.id ? s.info.ticketId : undefined);
  if (!ref) throw new OperationError('Which review? Pass `ticket`, or claim a review ticket first.');
  const review = ctx.findTicket(snap, ref);
  const agent = await ctx.agentId();
  const r = await submitReview(ctx.verifyEnv(), {
    mapId: snap.map.id,
    reviewId: review.id,
    agent,
    sessionIds: ctx.sessionIds,
    sessionId: s?.id,
    verdict: input.verdict,
    summary: input.summary,
    findings: input.findings,
  });
  ctx.leases.drop(snap.map.id, review.id);
  if (s?.info.ticketId === review.id) ctx.sessions.end(true, `Reviewed ${review.key}: ${input.verdict}`);
  const reviewed = snap.tickets.find((x) => x.id === review.reviewOf)!;
  const next = {
    done: `${reviewed.key} is done.`,
    rework: `${reviewed.key} went back for rework with your findings.`,
    blocked: `${reviewed.key} waits on the human.`,
    verifying: r.attemptId
      ? `The code changed since its checks passed, so they run again (${r.attemptId}).`
      : `${reviewed.key} waits for the human to approve.`,
  }[r.phase as 'done'];
  return { review: review.key, verdict: r.verdict.id, ticket: reviewed.key, phase: r.phase, next };
}
