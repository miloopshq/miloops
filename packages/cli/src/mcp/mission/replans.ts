import {
  frozenTickets,
  type DestinationReason,
  type MapSnapshot,
  type ReplanChange,
  type ReplanKind,
  type ReplanProposal,
} from '@miloops-hq/core';
import { listReplans, proposeReplan, readReplan, ReplanInvalid } from '@miloops-hq/core/agents';
import type { AgentContext } from './agentContext';
import type { WaitControl } from './types';

export interface ProposeArgs {
  mission?: string;
  kind?: ReplanKind;
  destinationReason?: DestinationReason;
  reason: string;
  evidence: string;
  invalidates?: string[];
  changes: ReplanChange[];
}

/**
 * `propose_replan`: ticket keys become ids (new refs stay refs), the engine validates the proposal and stores it.
 * Validation problems come back as `{ status: 'invalid', errors }`, so the agent can fix and propose again.
 */
export async function proposeReplanOp(ctx: AgentContext, input: ProposeArgs) {
  const snap = await ctx.resolveMission(input.mission);
  const by = await ctx.agentId();
  const s = await ctx.ensureSession();
  try {
    const r = await proposeReplan(
      { root: ctx.root, adapter: ctx.adapter, journal: ctx.journal },
      {
        mapId: snap.map.id,
        kind: input.kind ?? 'replan',
        destinationReason: input.destinationReason,
        reason: input.reason,
        evidence: input.evidence,
        invalidates: input.invalidates ?? [],
        changes: withIds(ctx, snap, input.changes),
        by,
        sessionId: s.id,
      },
    );
    s.log(`proposed ${r.proposal.id} · ${r.proposal.changes.length} changes · waiting on the human`, 'warn');
    return {
      id: r.proposal.id,
      status: r.proposal.status,
      kind: r.proposal.kind,
      diff: r.diff,
      frozen: r.frozen.map((id) => ctx.keyOf(id)),
      next: 'The human reviews it in the command center. Keep working on tickets it does not freeze; replan_status (wait: true) returns the decision.',
    };
  } catch (e) {
    if (e instanceof ReplanInvalid) return { status: 'invalid', errors: e.errors };
    throw e;
  }
}

/** `replan_status`: a proposal's decision (default: your latest on the mission); `wait` blocks until it's decided. */
export async function replanStatus(
  ctx: AgentContext,
  input: { mission?: string; id?: string; wait?: boolean; waitSeconds?: number },
  defaultWait: number,
  ctl: WaitControl,
) {
  const snap = await ctx.resolveMission(input.mission);
  const agent = await ctx.agentId();
  const id =
    input.id ??
    listReplans(ctx.root, snap.map.id)
      .filter((p) => p.by === agent)
      .at(-1)?.id;
  if (!id) return { replan: null, hint: 'You have no proposal on this mission.' };
  let p = readReplan(ctx.root, snap.map.id, id);
  if (input.wait && p?.status === 'pending')
    p = await waitForDecision(ctx, p, (input.waitSeconds ?? defaultWait) * 1000, ctl);
  if (!p) return { replan: null, hint: `No proposal ${id} on this mission.` };
  return { replan: await statusView(ctx, snap.map.id, p) };
}

async function waitForDecision(ctx: AgentContext, p: ReplanProposal, limitMs: number, ctl: WaitControl) {
  const started = Date.now();
  let lastBeat = started;
  let cur: ReplanProposal | undefined = p;
  while (cur?.status === 'pending' && Date.now() - started < limitMs && !ctl.signal?.aborted) {
    await new Promise((r) => setTimeout(r, 1000));
    cur = readReplan(ctx.root, p.mapId, p.id);
    if (Date.now() - lastBeat < 15_000) continue;
    lastBeat = Date.now();
    ctx.heartbeat();
    ctl.onProgress?.(Math.round((lastBeat - started) / 1000));
  }
  return cur;
}

async function statusView(ctx: AgentContext, mapId: string, p: ReplanProposal) {
  const fresh = await ctx.load(mapId);
  const keyOf = (id: string) => fresh.tickets.find((t) => t.id === id)?.key ?? id;
  return {
    id: p.id,
    kind: p.kind,
    status: p.status,
    ...(p.note ? { note: p.note } : {}),
    ...(p.decidedBy ? { decidedBy: p.decidedBy } : {}),
    ...(p.supersededBy ? { supersededBy: p.supersededBy } : {}),
    applied: `${p.applied.length} of ${p.changes.length}`,
    created: Object.values(p.created).map(keyOf),
    next: NEXT[p.status],
  };
}

const NEXT: Record<ReplanProposal['status'], string> = {
  pending: 'Still waiting on the human. Keep working on tickets the proposal does not freeze.',
  approved: 'Approved and applied: next_ticket picks from the new plan.',
  rejected: 'Rejected: read the note, then propose again or carry on with the current plan.',
  superseded: 'Replaced by your newer proposal.',
};

/** Ticket keys (`#12`) to ids; refs the proposal adds stay as they are; unknown refs are left for validation. */
function withIds(ctx: AgentContext, snap: MapSnapshot, changes: ReplanChange[]): ReplanChange[] {
  const newRefs = new Set(changes.flatMap((c) => (c.op === 'add_ticket' ? [c.ref] : [])));
  const id = (ref: string) => {
    if (newRefs.has(ref)) return ref;
    try {
      return ctx.findTicket(snap, ref).id;
    } catch {
      return ref;
    }
  };
  return changes.map((c) => {
    if (c.op === 'add_ticket') return { ...c, blockedBy: (c.blockedBy ?? []).map(id) };
    if (c.op === 'rewire') return { ...c, ticket: id(c.ticket), addBlockedBy: c.addBlockedBy.map(id) };
    if ('ticket' in c) return { ...c, ticket: id(c.ticket) };
    return c;
  });
}

/** Ticket id → proposal id, for the mission's pending proposals. */
export const frozenOn = (ctx: AgentContext, mapId: string) => frozenTickets(listReplans(ctx.root, mapId));

/** What status and resume show: challenged assumptions and pending proposals; undefined when there are none. */
export function adaptiveView(ctx: AgentContext, snap: MapSnapshot) {
  const challenged = (snap.map.sections.assumptions ?? []).filter((a) => a.status === 'challenged');
  const pending = listReplans(ctx.root, snap.map.id).filter((p) => p.status === 'pending');
  if (!challenged.length && !pending.length) return undefined;
  const frozen = frozenTickets(pending);
  return {
    challengedAssumptions: challenged.map((a) => ({ id: a.id, text: a.text, evidence: a.challenge?.evidence })),
    pendingReplans: pending.map((p) => ({
      id: p.id,
      kind: p.kind,
      by: p.by,
      reason: p.reason,
      frozen: [...frozen].filter(([, r]) => r === p.id).map(([t]) => ctx.keyOf(t)),
    })),
  };
}
