import {
  allowedTypes,
  attention,
  chooseNext,
  claim,
  deriveStates,
  leaseSpan,
  OperationError,
  promoteToTicket,
  release,
  type SessionHandle,
  type SessionMode,
  type Ticket,
  type TicketType,
} from '@miloops-hq/core';
import { baselineForClaim, repoRootOf } from '@miloops-hq/core/agents';
import type { AgentContext } from './agentContext';
import { recoverRuns } from './completion';
import { sessionView } from './reporting';
import { assertMayReview, ownReviews } from './reviews';
import { ticketInfo } from './ticketInfo';
import { baselineView } from './verificationView';

/** Expired claims of silent agents go back to the queue before work is picked. */
async function recoverStalled(ctx: AgentContext) {
  await recoverRuns(ctx);
  const back = await ctx.leases.reclaim(ctx.adapter);
  return back.map((l) => ({
    ticket: l.ticketKey,
    from: l.agent,
    note: `returned to queue after ${l.agent} went silent`,
  }));
}

export async function nextTicket(ctx: AgentContext, input: { mission?: string; types?: TicketType[] } = {}) {
  const recovered = await recoverStalled(ctx);
  const snap = await ctx.resolveMission(input.mission);
  const t = chooseNext(snap, { types: input.types, exclude: ownReviews(ctx, snap, await ctx.agentId()) });
  const extra = recovered.length ? { recovered } : {};
  if (t) return { ticket: ticketInfo(ctx.root, snap, t, await ctx.decisions(snap.map.id)), ...extra };
  const states = deriveStates(snap.tickets, snap.map.mode);
  const open = snap.tickets.filter((x) => x.state === 'open');
  const reason = !open.length
    ? 'Every ticket is closed: the mission is decided.'
    : `No ready ticket: ${open.filter((x) => states.get(x.id) === 'claimed').length} claimed, ${open.filter((x) => states.get(x.id) === 'blocked').length} blocked, ${open.filter((x) => states.get(x.id) === 'parked').length} parked${[
        'verifying',
        'held',
      ]
        .map((st) => [st, open.filter((x) => states.get(x.id) === st).length] as const)
        .filter(([, n]) => n)
        .map(([st, n]) => `, ${n} ${st === 'held' ? 'waiting on the human' : st}`)
        .join('')}.`;
  return { ticket: null, reason, ...extra };
}

export async function claimTicket(ctx: AgentContext, input: { ticket?: string; mission?: string } = {}) {
  const recovered = await recoverStalled(ctx);
  const snap = await ctx.resolveMission(input.mission);
  ctx.mission = snap.map.id;
  const agent = await ctx.agentId();
  const target = input.ticket
    ? ctx.findTicket(snap, input.ticket)
    : chooseNext(snap, { exclude: ownReviews(ctx, snap, agent) });
  if (target) assertMayReview(ctx, snap, target, agent);
  if (!target) {
    const r = await nextTicket(ctx, { mission: snap.map.id });
    throw new OperationError(('reason' in r ? r.reason : undefined) ?? 'No ready ticket');
  }
  const t =
    target.assignee === agent && deriveStates(snap.tickets, snap.map.mode).get(target.id) === 'claimed'
      ? target
      : await claim(ctx.adapter, snap.map.id, target.id, agent, { journal: ctx.journal });
  const mode: SessionMode = t.type === 'research' ? 'research' : 'work';
  const cur = ctx.sessions.running();
  let s: SessionHandle;
  if (cur && cur.info.mode === mode && cur.info.mapId === snap.map.id && !cur.info.ticketId) s = cur;
  else {
    s = await ctx.open(mode, snap.map.id, t.id);
    if (mode === 'work') s.step(1, 'reading mission + tickets');
  }
  const hitl = attention(t) === 'hitl';
  if (mode === 'research') {
    s.step(1, t.key, t.id);
    s.step(2, t.title);
  } else {
    s.step(2, `${t.key} ${t.title}`, t.id);
    s.step(3, `${t.key} ${t.type} · ${hitl ? 'with you' : 'agent only'}`);
  }
  const lease = ctx.leases.hold(agent, snap.map.id, t, s.id);
  const baseline = await baselineForClaim({
    root: ctx.root,
    cwd: repoRootOf(ctx.verifyEnv()),
    mapId: snap.map.id,
    ticket: t,
    agent,
    sessionId: s.id,
    resume: t === target || target.status === 'rework',
  });
  const fresh = await ctx.load(snap.map.id);
  return {
    claimed: ticketInfo(
      ctx.root,
      fresh,
      fresh.tickets.find((x) => x.id === t.id)!,
      await ctx.decisions(snap.map.id),
    ),
    session: sessionView(ctx),
    git: baselineView(baseline),
    lease: {
      expiresAt: new Date(lease.expiresAt).toISOString(),
      length: leaseSpan(lease.ttlMs),
      renewedBy: 'every tool call of yours; report_progress notes are kept for whoever resumes if you go silent',
    },
    ...(recovered.length ? { recovered } : {}),
  };
}

export async function releaseTicket(ctx: AgentContext, input: { ticket?: string; mission?: string; reason?: string }) {
  const snap = await ctx.resolveMission(input.mission);
  const ref = input.ticket ?? ctx.sessions.running()?.info.ticketId;
  if (!ref) throw new OperationError('Which ticket? Pass `ticket`.');
  const t = ctx.findTicket(snap, ref);
  if (t.assignee !== (await ctx.agentId()))
    throw new OperationError(`${t.key} is not claimed by you${t.assignee ? ` (assignee: ${t.assignee})` : ''}`);
  await release(ctx.adapter, snap.map.id, t.id, { ...ctx.actor(), reason: input.reason });
  ctx.leases.drop(snap.map.id, t.id);
  if (ctx.sessions.running()?.info.ticketId === t.id)
    ctx.sessions.end(true, `Released ${t.key}${input.reason ? ` · ${input.reason}` : ''}`);
  return { released: t.key };
}

export async function addTicket(
  ctx: AgentContext,
  input: {
    mission?: string;
    title: string;
    type: TicketType;
    body?: string;
    hitl?: boolean;
    blockedBy?: string[];
    fromUnspecified?: string;
  },
) {
  const snap = await ctx.resolveMission(input.mission);
  if (!allowedTypes(snap.map.mode).includes(input.type))
    throw new OperationError(`${input.type} tickets are disabled on plan-only missions`);
  const s = await ctx.ensureSession();
  const blockers = (input.blockedBy ?? []).map((b) => ctx.findTicket(snap, b).id);
  let t: Ticket;
  if (input.fromUnspecified) {
    t = await promoteToTicket(ctx.adapter, snap.map.id, input.fromUnspecified, {
      type: input.type,
      hitl: input.hitl,
      title: input.title,
      body: input.body,
      blockedBy: blockers,
    });
    s.log(`promoted to ${t.key} · ${input.fromUnspecified}`, 'ok');
  } else {
    t = await ctx.adapter.createTicket(snap.map.id, {
      title: input.title,
      type: input.type,
      hitl: input.hitl,
      body: `${input.body ?? ''}\n\nPart of mission ${snap.map.key}.`.trim(),
    });
    for (const b of blockers) await ctx.adapter.addBlocking(snap.map.id, b, t.id);
  }
  const fresh = await ctx.load(snap.map.id);
  return {
    ticket: ticketInfo(
      ctx.root,
      fresh,
      fresh.tickets.find((x) => x.id === t.id)!,
    ),
  };
}
