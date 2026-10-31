import {
  attention,
  chooseNext,
  deriveStates,
  OperationError,
  resolve,
  ruleOutOfScope,
  type DecisionMeta,
  type DecisionRecord,
} from '@miloops-hq/core';
import { levelFor } from '@miloops-hq/core/agents';
import type { AgentContext } from './agentContext';
import { submitVerified } from './completion';
import { claimTicket } from './ticketOps';
import type { WaitControl } from './types';

export interface CloseInput {
  ticket?: string;
  mission?: string;
  resolution: string;
  summary?: string;
  rationale?: string;
  alternatives?: string[];
  outcome?: 'completed' | 'out_of_scope';
  postTranscript?: boolean;
  /** How long to wait for checks when the completion needs verification. */
  waitSeconds?: number;
}

/**
 * Resolves a ticket (or rules it out), records the decision with this
 * session's transcript and ends the session. When the ticket's completion
 * needs verification, it goes to verifying and is only closed once its
 * checks pass.
 */
export async function closeTicket(ctx: AgentContext, input: CloseInput, wait: { seconds: number; ctl?: WaitControl }) {
  const s0 = ctx.sessions.running();
  const snap = await ctx.resolveMission(input.mission ?? (s0?.info.mapId || undefined));
  const ref = input.ticket ?? (s0?.info.mapId === snap.map.id ? s0.info.ticketId : undefined);
  if (!ref) throw new OperationError('Which ticket? Pass `ticket`, or claim one first.');
  const agent = await ctx.agentId();
  let t = ctx.findTicket(snap, ref);
  if (t.state === 'closed') throw new OperationError(`${t.key} is already closed`);
  if (t.assignee && t.assignee !== agent) throw new OperationError(`${t.key} is claimed by ${t.assignee}`);
  if (t.status === 'verifying')
    throw new OperationError(`${t.key} is being verified: call verification_status ${t.key} for the result`);
  if (!t.assignee && input.outcome !== 'out_of_scope') {
    await claimTicket(ctx, { ticket: t.id, mission: snap.map.id });
    t = (await ctx.load(snap.map.id)).tickets.find((x) => x.id === t.id)!;
  }
  const s = ctx.sessions.running()?.info.ticketId === t.id ? ctx.sessions.running()! : await ctx.ensureSession();
  const before = new Set(
    [...deriveStates(snap.tickets, snap.map.mode)].filter(([, v]) => v === 'frontier').map(([k]) => k),
  );
  const source = { kind: 'agent' as const, ref: `${s.id}/${t.id}`, label: `${agent} session` };
  const findDecision = async () =>
    (await ctx.decisions(snap.map.id)).find((d) => d.ticketId === t.id && d.source.ref === source.ref);
  let decision: DecisionRecord | undefined;
  let verified: object = {};
  if (input.outcome === 'out_of_scope') {
    await ruleOutOfScope(
      ctx.adapter,
      snap.map.id,
      { ticketId: t.id },
      { reason: input.resolution, author: agent, source },
      ctx.actor(),
    );
    decision = await findDecision();
  } else {
    const log = ctx.sessions.transcript(s.id) ?? [];
    const human = log.filter((e) => e.from === 'human');
    const meta: DecisionMeta = {
      rationale: input.rationale,
      alternatives: input.alternatives,
      decidedBy: human.length ? human[human.length - 1].author : agent,
      participants: [...new Set([agent, ...human.map((e) => e.author)])].map((id) => ({ id })),
      source,
      transcript: log,
    };
    const transcript =
      input.postTranscript && log.length ? log.map((e) => `**${e.author}:** ${e.text}`).join('\n\n') : undefined;
    const { info } = levelFor(ctx.root, snap, t);
    if (info.level !== 'off') {
      s.step(4, `checks: ${info.checks.join(', ') || 'none configured'}`);
      const r = await submitVerified(
        ctx,
        snap,
        t,
        info,
        {
          agent,
          sessionId: s.id,
          resolution: input.resolution,
          summary: input.summary,
          rationale: input.rationale,
          alternatives: input.alternatives,
          decision: meta,
          transcript,
        },
        { seconds: input.waitSeconds ?? wait.seconds, ctl: wait.ctl ?? {} },
      );
      if (r.status !== 'done') {
        if (!('pending' in r) && s.info.ticketId === t.id)
          ctx.sessions.end(true, `${t.key} ${r.attempt} · ${r.status}`);
        return { ticket: t.key, ...r };
      }
      verified = r;
    } else {
      if (s.info.mode === 'research') s.step(3, `${t.key} decided`);
      else s.step(4, `${transcript ? 'transcript + ' : ''}comment + close + record decision`);
      await resolve(
        ctx.adapter,
        snap.map.id,
        t.id,
        { answer: input.resolution, summary: input.summary, author: agent, transcript, decision: meta },
        ctx.actor(),
      );
    }
    decision = await findDecision();
    if (s.info.mode === 'work') s.step(5);
  }
  ctx.leases.drop(snap.map.id, t.id);
  const after = await ctx.load(snap.map.id);
  const states = deriveStates(after.tickets, after.map.mode);
  const unblocked = after.tickets.filter((x) => states.get(x.id) === 'frontier' && !before.has(x.id));
  if (s.info.ticketId === t.id)
    ctx.sessions.end(true, `${t.key} ${input.outcome === 'out_of_scope' ? 'ruled out' : 'decided'} · session closed`);
  const next = chooseNext(after);
  const open = after.tickets.filter((x) => x.state === 'open').length;
  return {
    closed: t.key,
    outcome: input.outcome ?? 'completed',
    ...verified,
    decision: decision ? { id: decision.id, summary: decision.summary, decidedBy: decision.decidedBy } : null,
    unblocked: unblocked.map((x) => ({ key: x.key, title: x.title, type: x.type })),
    next: next ? { key: next.key, title: next.title, type: next.type, attention: attention(next) } : null,
    missionDone: open === 0,
  };
}
