import { OperationError, recordDecision as saveDecision, STEPS, stepTag } from '@miloops-hq/core';
import type { AgentContext } from './agentContext';

export function sessionView(ctx: AgentContext) {
  const s = ctx.sessions.current?.info;
  if (!s) return null;
  return {
    id: s.id,
    agent: s.agent,
    mode: s.mode,
    step: s.step ? stepTag(s.mode, s.step) : 'BOOT',
    stepLabel: s.stepLabel,
    ticket: s.ticketId && ctx.keyOf(s.ticketId),
    status: s.status,
    usage: s.usage,
  };
}

export async function report(
  ctx: AgentContext,
  input: {
    message?: string;
    level?: 'info' | 'ok' | 'warn' | 'alert';
    step?: string | number;
    say?: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  },
) {
  const s = await ctx.ensureSession();
  if (input.step !== undefined) {
    const steps = STEPS[s.info.mode];
    const n =
      typeof input.step === 'number'
        ? input.step
        : steps.findIndex((x) => x.toLowerCase() === String(input.step).toLowerCase()) + 1 || Number(input.step);
    if (!Number.isInteger(n) || n < 1 || n > steps.length)
      throw new OperationError(`step must be 1-${steps.length} or one of: ${steps.join(', ')}`);
    s.step(n, input.message);
  } else if (input.message) s.log(input.message, input.level ?? 'info');
  if (input.say) {
    s.say(input.say);
    ctx.sessions.note(s, 'agent', s.info.agent, input.say);
  }
  const u = {
    inputTokens: Math.max(0, input.inputTokens ?? 0),
    outputTokens: Math.max(0, input.outputTokens ?? 0),
    costUsd: Math.max(0, input.costUsd ?? 0),
  };
  const note = input.message ?? input.say;
  if (note) ctx.heartbeat({ ticketId: s.info.ticketId, note });
  const measured = ctx.sessions.measure(s);
  if (!measured && (u.inputTokens || u.outputTokens || u.costUsd)) s.usage({ ...u, source: 'reported' });
  return {
    session: sessionView(ctx),
    usageSource: measured
      ? `${s.info.usage?.source} logs (reported numbers are ignored)`
      : s.info.usage
        ? 'reported'
        : 'none',
  };
}

export async function recordDecision(
  ctx: AgentContext,
  input: {
    mission?: string;
    ticket?: string;
    question: string;
    answer: string;
    summary?: string;
    rationale?: string;
    alternatives?: string[];
    decidedBy?: string;
    appendToMission?: boolean;
  },
) {
  const s = ctx.sessions.running();
  const snap = await ctx.resolveMission(input.mission ?? (s?.info.mapId || undefined));
  const agent = await ctx.agentId();
  const t = input.ticket ? ctx.findTicket(snap, input.ticket) : undefined;
  const rec = await saveDecision(
    ctx.adapter,
    snap.map.id,
    {
      ticketId: t?.id,
      ticketKey: t?.key,
      question: input.question,
      answer: input.answer,
      summary: input.summary,
      alternatives: input.alternatives,
      rationale: input.rationale,
      decidedBy: input.decidedBy ?? agent,
      participants: [...new Set([agent, input.decidedBy ?? agent])].map((id) => ({ id })),
      source: {
        kind: 'agent',
        ref: `${s?.id ?? `${agent}@${process.pid}`}/d${ctx.decisionSeq++}`,
        label: `${agent} session`,
      },
    },
    { appendToMission: input.appendToMission },
  );
  ctx.heartbeat({ ticketId: t?.id ?? s?.info.ticketId, decision: `${rec.id} · ${rec.summary}` });
  return { decision: rec };
}
