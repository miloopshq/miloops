import {
  attention,
  chooseNext,
  deriveStates,
  OperationError,
  resolve,
  ruleOutOfScope,
  type DecisionRecord,
} from '@miloops-hq/core';
import type { AgentContext } from './agentContext';
import { claimTicket } from './ticketOps';

/** Resolves a ticket (or rules it out), records the decision with this session's transcript and ends the session. */
export async function closeTicket(
  ctx: AgentContext,
  input: {
    ticket?: string;
    mission?: string;
    resolution: string;
    summary?: string;
    rationale?: string;
    alternatives?: string[];
    outcome?: 'completed' | 'out_of_scope';
    postTranscript?: boolean;
  },
) {
  const s0 = ctx.sessions.running();
  const snap = await ctx.resolveMission(input.mission ?? (s0?.info.mapId || undefined));
  const ref = input.ticket ?? (s0?.info.mapId === snap.map.id ? s0.info.ticketId : undefined);
  if (!ref) throw new OperationError('Which ticket? Pass `ticket`, or claim one first.');
  const agent = await ctx.agentId();
  let t = ctx.findTicket(snap, ref);
  if (t.state === 'closed') throw new OperationError(`${t.key} is already closed`);
  if (t.assignee && t.assignee !== agent) throw new OperationError(`${t.key} is claimed by ${t.assignee}`);
  if (!t.assignee && input.outcome !== 'out_of_scope') {
    await claimTicket(ctx, { ticket: t.id, mission: snap.map.id });
    t = (await ctx.load(snap.map.id)).tickets.find((x) => x.id === t.id)!;
  }
  const s = ctx.sessions.running()?.info.ticketId === t.id ? ctx.sessions.running()! : await ctx.ensureSession();
  const before = new Set(
    [...deriveStates(snap.tickets, snap.map.mode)].filter(([, v]) => v === 'frontier').map(([k]) => k),
  );
  const source = { kind: 'agent' as const, ref: `${s.id}/${t.id}`, label: `${agent} session` };
  let decision: DecisionRecord | undefined;
  if (input.outcome === 'out_of_scope') {
    await ruleOutOfScope(
      ctx.adapter,
      snap.map.id,
      { ticketId: t.id },
      { reason: input.resolution, author: agent, source },
      ctx.actor(),
    );
    decision = (await ctx.decisions(snap.map.id)).find((d) => d.ticketId === t.id && d.source.ref === source.ref);
  } else {
    const log = ctx.sessions.transcript(s.id) ?? [];
    const human = log.filter((e) => e.from === 'human');
    if (s.info.mode === 'research') s.step(3, `${t.key} decided`);
    else s.step(4, `${input.postTranscript && log.length ? 'transcript + ' : ''}comment + close + record decision`);
    await resolve(
      ctx.adapter,
      snap.map.id,
      t.id,
      {
        answer: input.resolution,
        summary: input.summary,
        author: agent,
        transcript:
          input.postTranscript && log.length ? log.map((e) => `**${e.author}:** ${e.text}`).join('\n\n') : undefined,
        decision: {
          rationale: input.rationale,
          alternatives: input.alternatives,
          decidedBy: human.length ? human[human.length - 1].author : agent,
          participants: [...new Set([agent, ...human.map((e) => e.author)])].map((id) => ({ id })),
          source,
          transcript: log,
        },
      },
      ctx.actor(),
    );
    decision = (await ctx.decisions(snap.map.id)).find((d) => d.source.ref === source.ref);
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
    decision: decision ? { id: decision.id, summary: decision.summary, decidedBy: decision.decidedBy } : null,
    unblocked: unblocked.map((x) => ({ key: x.key, title: x.title, type: x.type })),
    next: next ? { key: next.key, title: next.title, type: next.type, attention: attention(next) } : null,
    missionDone: open === 0,
  };
}
