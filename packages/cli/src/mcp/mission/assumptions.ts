import {
  addAssumptions,
  challengeAssumption,
  OperationError,
  type Assumption,
  type AssumptionInput,
  type MapSnapshot,
} from '@miloops-hq/core';
import type { AgentContext } from './agentContext';

/** An assumption as an agent states it: `tickets` are ticket keys or ids (or plan refs in start_mission). */
export interface AssumptionPlanInput {
  text: string;
  tickets?: string[];
}

/** Agent input to core input: ticket refs become ids; `byRef` resolves start_mission's plan refs. */
export function assumptionInputs(
  ctx: AgentContext,
  at: { snap: MapSnapshot; items: AssumptionPlanInput[]; byRef?: Map<string, string> },
): AssumptionInput[] {
  const idOf = (ref: string) => at.byRef?.get(ref) ?? ctx.findTicket(at.snap, ref).id;
  return at.items.map((a) => ({ text: a.text, tickets: (a.tickets ?? []).map(idOf) }));
}

/** `update_mission addAssumptions`. */
export async function addMissionAssumptions(ctx: AgentContext, snap: MapSnapshot, items: AssumptionPlanInput[]) {
  return addAssumptions(ctx.adapter, snap.map.id, assumptionInputs(ctx, { snap, items }));
}

/** `list_assumptions`: what the mission relies on, with the tickets and decisions that depend on each. */
export async function listAssumptions(ctx: AgentContext, input: { mission?: string }) {
  const snap = await ctx.resolveMission(input.mission);
  const records = await ctx.decisions(snap.map.id);
  const assumptions = (snap.map.sections.assumptions ?? []).map((a) => ({
    ...assumptionView(snap, a),
    decisions: records.filter((d) => d.assumes?.includes(a.id)).map((d) => d.id),
  }));
  return { mission: snap.map.key, assumptions };
}

/** `challenge_assumption`: marks it challenged with your evidence; propose a replan next. */
export async function challengeAssumptionOp(
  ctx: AgentContext,
  input: { mission?: string; assumption: string; evidence: string; ticket?: string },
) {
  const snap = await ctx.resolveMission(input.mission);
  const t = input.ticket ? ctx.findTicket(snap, input.ticket) : undefined;
  const r = await challengeAssumption(ctx.adapter, snap.map.id, {
    assumption: input.assumption,
    evidence: input.evidence,
    by: await ctx.agentId(),
    ticketId: t?.id ?? ctx.sessions.running()?.info.ticketId,
  });
  (await ctx.ensureSession()).log(`challenged ${r.assumption.id} · ${r.assumption.text}`, 'warn');
  return {
    assumption: assumptionView(snap, r.assumption),
    dependents: { tickets: r.tickets.map((id) => ctx.keyOf(id)), decisions: r.decisions },
    next: `propose_replan with the changes this calls for (invalidates: ["${r.assumption.id}"]), then keep working on tickets it does not freeze.`,
  };
}

/** Every id in `assumes` must be one of the mission's assumptions. */
export function assertAssumes(snap: MapSnapshot, assumes: string[] | undefined) {
  const known = new Set((snap.map.sections.assumptions ?? []).map((a) => a.id));
  const unknown = (assumes ?? []).filter((id) => !known.has(id));
  if (unknown.length) throw new OperationError(`unknown assumption ${unknown.join(', ')}: see list_assumptions`);
}

function assumptionView(snap: MapSnapshot, a: Assumption) {
  const keyOf = (id: string) => snap.tickets.find((t) => t.id === id)?.key ?? id;
  return {
    id: a.id,
    text: a.text,
    status: a.status,
    tickets: a.tickets.map(keyOf),
    ...(a.source ? { source: a.source } : {}),
    ...(a.challenge ? { challenge: { ...a.challenge, at: new Date(a.challenge.at).toISOString() } } : {}),
  };
}
