import { chooseNext, chartMap, deriveStates, OperationError, type MapMode } from '@miloops-hq/core';
import { readAgentDocs, readVerificationConfig } from '@miloops-hq/core/agents';
import type { AgentContext } from './agentContext';
import { ticketInfo } from './ticketInfo';
import type { TicketPlanInput } from './types';
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
  const base = { agent: await ctx.agentId(), commandCenter: ctx.commandCenter(), missions };
  if (!maps.length) return { ...base, mission: null, hint: 'No missions yet. Start one with start_mission.' };
  const snap = await ctx.resolveMission(missionRef);
  const records = await ctx.decisions(snap.map.id);
  return { ...base, mission: missionView(snap, docs, records, (id) => ctx.keyOf(id)) };
}

export async function startMission(
  ctx: AgentContext,
  input: {
    title: string;
    destination: string;
    notes?: string;
    mode?: MapMode;
    tickets?: TicketPlanInput[];
    decided?: string[];
    unspecified?: string[];
    outOfScope?: string[];
  },
) {
  const s = await ctx.chartSession();
  s.step(1, input.destination);
  s.step(2, `${input.tickets?.length ?? 0} tickets proposed`);
  for (const t of input.tickets ?? []) s.log(`proposed ${t.type} · ${t.title}`);
  const refs = new Set((input.tickets ?? []).map((t) => t.ref));
  for (const t of input.tickets ?? [])
    for (const b of t.blockedBy ?? [])
      if (!refs.has(b)) throw new OperationError(`ticket "${t.ref}" is blocked by unknown ref "${b}"`);
  s.step(3, input.title);
  const level = readVerificationConfig(ctx.root).config?.default;
  const { map, tickets } = await chartMap(
    ctx.adapter,
    {
      title: input.title,
      mode: input.mode,
      ...(level && level !== 'off' ? { verification: level } : {}),
      sections: {
        destination: input.destination,
        notes: input.notes ?? '',
        decisions: (input.decided ?? []).map((text) => ({ text })),
        unspecified: input.unspecified ?? [],
        outOfScope: input.outOfScope ?? [],
      },
      tickets: (input.tickets ?? []).map((t) => ({ ...t, body: t.body ?? '' })),
    },
    {
      onMapCreated: (m) => {
        s.bindMap(m.id);
        s.log(`mission ${m.key} online`, 'ok');
        s.step(4, `${input.tickets?.length ?? 0} tickets`);
      },
    },
  );
  ctx.mission = map.id;
  s.step(5, 'ready for agents');
  const framing = ctx.sessions.transcript(s.id) ?? [];
  ctx.sessions.end(true, `Mission launched · ${tickets.length} tickets`, true);
  const snap = await ctx.load(map.id);
  const next = chooseNext(snap);
  return {
    mission: {
      id: map.id,
      key: map.key,
      title: map.title,
      mode: map.mode,
      ...(map.verification ? { verification: map.verification } : {}),
    },
    tickets: tickets.map((t) => ({
      ref: (input.tickets ?? []).find((p) => p.title === t.title)?.ref,
      key: t.key,
      title: t.title,
      type: t.type,
    })),
    framingQuestionsAnswered: framing.filter((e) => e.from === 'human').length,
    next: next ? ticketInfo(ctx.root, snap, next) : null,
    commandCenter: ctx.commandCenter(),
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
  const next = chooseNext(snap);
  return {
    ...current,
    yourClaim: mine ? ticketInfo(ctx.root, snap, mine, await ctx.decisions(snap.map.id)) : null,
    next: next ? ticketInfo(ctx.root, snap, next, await ctx.decisions(snap.map.id)) : null,
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
  s.log(`mission updated · ${[...Object.keys(patch), ...(input.mode ? ['mode'] : [])].join(', ') || 'no change'}`);
  return (await status(ctx, snap.map.id)).mission;
}
