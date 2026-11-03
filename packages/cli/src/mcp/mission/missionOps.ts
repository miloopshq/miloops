import { chooseNext, deriveStates, type MapMode } from '@miloops-hq/core';
import { readAgentDocs } from '@miloops-hq/core/agents';
import type { AgentContext } from './agentContext';
import { addMissionAssumptions, type AssumptionPlanInput } from './assumptions';
import { attentionSummary } from './attention';
import { deliveryView } from './deliveryView';
import { briefView, claimable } from './discovery';
import { knowledgeFor } from './knowledge';
import { adaptiveView, frozenOn } from './replans';
import { ticketInfo } from './ticketInfo';
import { missionView } from './views';

export async function status(ctx: AgentContext, missionRef?: string) {
  const maps = await ctx.adapter.listMaps();
  ctx.flush();
  const docs = await readAgentDocs(ctx.root);
  const missions = await Promise.all(
    maps.map(async (m) => {
      const s = await ctx.load(m.id);
      return {
        id: m.id,
        key: m.key,
        title: m.title,
        decided: s.tickets.filter((t) => t.state === 'closed' && t.closeReason === 'completed').length,
        tickets: s.tickets.length,
      };
    }),
  );
  const base = {
    agent: await ctx.agentId(),
    commandCenter: ctx.commandCenter(),
    missions,
    attention: await attentionSummary(ctx),
  };
  if (!maps.length) return { ...base, mission: null, hint: 'No missions yet. Start one with start_mission.' };
  const snap = await ctx.resolveMission(missionRef);
  const records = await ctx.decisions(snap.map.id);
  return {
    ...base,
    mission: missionView(snap, docs, records, (id) => ctx.keyOf(id)),
    delivery: deliveryView(ctx.root, snap, docs),
    adaptive: adaptiveView(ctx, snap),
  };
}

export async function resumeMission(ctx: AgentContext, missionRef?: string) {
  const snap = await ctx.resolveMission(missionRef);
  ctx.mission = snap.map.id;
  const cur = ctx.sessions.running();
  if (!cur || cur.info.mapId !== snap.map.id)
    (await ctx.open('work', snap.map.id)).step(1, 'reading mission + tickets');
  const current = await status(ctx, snap.map.id);
  const agent = await ctx.agentId();
  const states = deriveStates(snap.tickets, snap.map.mode);
  const mine = snap.tickets.find((t) => states.get(t.id) === 'claimed' && t.assignee === agent);
  const exclude = [...frozenOn(ctx, snap.map.id).keys()];
  const next = chooseNext(snap, { types: claimable(ctx.root, snap.map.id), exclude });
  return {
    ...current,
    discovery: briefView(ctx.root, snap),
    yourClaim: mine ? ticketInfo(ctx.root, snap, mine, await ctx.decisions(snap.map.id)) : null,
    next: next ? ticketInfo(ctx.root, snap, next, await ctx.decisions(snap.map.id)) : null,
    knowledge: mine || next ? knowledgeFor(ctx.root, snap, (mine ?? next)!) : undefined,
  };
}

export async function updateMission(
  ctx: AgentContext,
  input: {
    mission?: string;
    destination?: string;
    notes?: string;
    addUnspecified?: string[];
    addOutOfScope?: string[];
    addAssumptions?: AssumptionPlanInput[];
    mode?: MapMode;
  },
) {
  const snap = await ctx.resolveMission(input.mission);
  const s = await ctx.ensureSession();
  const sec = snap.map.sections;
  const patch = {
    ...(input.destination !== undefined ? { destination: input.destination } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.addUnspecified?.length
      ? { unspecified: [...sec.unspecified, ...input.addUnspecified.filter((x) => !sec.unspecified.includes(x))] }
      : {}),
    ...(input.addOutOfScope?.length ? { outOfScope: [...sec.outOfScope, ...input.addOutOfScope] } : {}),
  };
  if (Object.keys(patch).length) await ctx.adapter.updateMapSections(snap.map.id, patch);
  if (input.mode && input.mode !== snap.map.mode) await ctx.adapter.setMapMode(snap.map.id, input.mode);
  const added = input.addAssumptions?.length ? await addMissionAssumptions(ctx, snap, input.addAssumptions) : [];
  const changed = [...Object.keys(patch), ...(input.mode ? ['mode'] : []), ...(added.length ? ['assumptions'] : [])];
  s.log(`mission updated · ${changed.join(', ') || 'no change'}`);
  return (await status(ctx, snap.map.id)).mission;
}
