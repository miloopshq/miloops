import type { TrackerAdapter } from '../adapters/adapter';
import { deriveStates, frontier } from './derive';
import { DEFAULT_MAP_MODE, TICKET_TYPES } from '../model/types';
import { firstSentence } from './decisions';
import type { DecisionInput, DecisionRecord, DecisionSource, MapMode, MapSections, MapSnapshot, Participant, Ticket, TicketType, MapDoc, TranscriptEntry } from '../model/types';

/**
 * Map operations, composed from tracker primitives. Every front end
 * (command center, CLI, MCP server) should call these rather than the adapter
 * directly so the rules live in one place.
 */

export class OperationError extends Error {}

export interface ChartPlanTicket {
  /** Local reference used to wire blocking before real ids exist. */
  ref: string;
  title: string;
  type: TicketType;
  hitl?: boolean;
  body: string;
  blockedBy?: string[];
}

export interface ChartPlan {
  title: string;
  mode?: MapMode;
  sections: MapSections;
  tickets: ChartPlanTicket[];
}

export interface ChartHooks {
  onMapCreated?(map: MapDoc): void | Promise<void>;
  onTicketCreated?(t: Ticket, ref: string): void | Promise<void>;
  onEdgeWired?(blocker: Ticket, blocked: Ticket): void | Promise<void>;
}

/** Create map, then create all tickets, then wire blocking (in that order, as trackers need ids first). */
export async function chartMap(adapter: TrackerAdapter, input: ChartPlan, hooks: ChartHooks = {}) {
  const plan = withMode(input, input.mode ?? DEFAULT_MAP_MODE);
  const map = await adapter.createMap({ title: plan.title, mode: plan.mode, sections: plan.sections });
  await hooks.onMapCreated?.(map);
  const byRef = new Map<string, Ticket>();
  for (const pt of plan.tickets) {
    const t = await adapter.createTicket(map.id, {
      title: pt.title,
      type: pt.type,
      hitl: pt.hitl,
      body: `${pt.body}\n\nPart of mission ${map.key}.`,
    });
    byRef.set(pt.ref, t);
    await hooks.onTicketCreated?.(t, pt.ref);
  }
  for (const pt of plan.tickets) {
    for (const b of pt.blockedBy ?? []) {
      const blocker = byRef.get(b);
      const blocked = byRef.get(pt.ref)!;
      if (!blocker) continue;
      await adapter.addBlocking(map.id, blocker.id, blocked.id);
      await hooks.onEdgeWired?.(blocker, blocked);
    }
  }
  return { map, tickets: [...byRef.values()] };
}

export function chooseNext(snap: MapSnapshot, opts: { types?: TicketType[]; exclude?: string[] } = {}) {
  return frontier(snap.tickets, snap.map.mode).find(
    (t) => (!opts.types || opts.types.includes(t.type)) && !opts.exclude?.includes(t.id),
  );
}

/** Claim = assignment. Re-reads after assigning to detect a parallel session winning the race. */
export async function claim(adapter: TrackerAdapter, mapId: string, ticketId: string, assignee: string) {
  const before = await adapter.loadMap(mapId);
  const t = before.tickets.find((x) => x.id === ticketId);
  if (!t) throw new OperationError(`ticket ${ticketId} not found`);
  const state = deriveStates(before.tickets, before.map.mode).get(ticketId);
  if (state !== 'frontier') throw new OperationError(`${t.key} is ${state}, not on the frontier`);
  await adapter.assign(mapId, ticketId, assignee);
  const after = await adapter.loadMap(mapId);
  const now = after.tickets.find((x) => x.id === ticketId)!;
  if (now.assignee !== assignee) throw new OperationError(`${t.key} was claimed by ${now.assignee}`);
  return now;
}

export async function release(adapter: TrackerAdapter, mapId: string, ticketId: string) {
  await adapter.assign(mapId, ticketId, null);
}

/** Audit fields a caller can attach when resolving; everything defaults from the ticket and author. */
export interface DecisionMeta {
  question?: string;
  alternatives?: string[];
  rationale?: string;
  /** Actor id of who made the call; defaults to the resolving author. */
  decidedBy?: string;
  participants?: Participant[];
  source?: DecisionSource;
  /** Kept on the record even when only a summary is posted to the ticket. */
  transcript?: TranscriptEntry[];
}

/** Resolve: resolution comment, close, decision record + line in the map's "Decisions so far". */
export async function resolve(
  adapter: TrackerAdapter,
  mapId: string,
  ticketId: string,
  input: { answer: string; author: string; summary?: string; transcript?: string; decision?: DecisionMeta; missionLine?: string },
) {
  const snap = await adapter.loadMap(mapId);
  const t = snap.tickets.find((x) => x.id === ticketId);
  if (!t) throw new OperationError(`ticket ${ticketId} not found`);
  if (t.state === 'closed') throw new OperationError(`${t.key} is already closed`);
  if (input.transcript) await adapter.comment(mapId, ticketId, input.author, `**HITL transcript**\n\n${input.transcript}`);
  await adapter.comment(mapId, ticketId, input.author, `**Resolution**\n\n${input.answer}`);
  await adapter.close(mapId, ticketId, 'completed');
  const d = input.decision ?? {};
  await recordDecision(
    adapter,
    mapId,
    {
      ticketId: t.id,
      ticketKey: t.key,
      question: d.question ?? t.title,
      answer: input.answer,
      summary: input.summary ?? firstSentence(input.answer),
      alternatives: d.alternatives,
      rationale: d.rationale,
      decidedBy: d.decidedBy ?? input.author,
      participants: d.participants,
      source: d.source ?? { kind: 'agent', label: input.author },
      transcript: d.transcript,
    },
    { missionLine: input.missionLine },
  );
  return t;
}

/**
 * Record a decision (from any source: command center, agent, Slack, tracker import)
 * and, unless `appendToMission` is false, add `missionLine` (default: its summary) to the map's "Decisions so far".
 * Re-recording the same `source.kind` + `source.ref` returns the existing record.
 */
export async function recordDecision(adapter: TrackerAdapter, mapId: string, input: DecisionInput, opts: { appendToMission?: boolean; missionLine?: string } = {}) {
  if (input.source.ref) {
    const dup = (await adapter.listDecisions(mapId)).find((d) => d.source.kind === input.source.kind && d.source.ref === input.source.ref);
    if (dup) return dup;
  }
  const rec = await adapter.createDecision(mapId, input);
  if (opts.appendToMission ?? true) {
    const fresh = await adapter.loadMap(mapId);
    await adapter.updateMapSections(mapId, {
      decisions: [...fresh.map.sections.decisions, { ticketId: rec.ticketId, ticketKey: rec.ticketKey, text: opts.missionLine ?? rec.summary }],
    });
  }
  return rec;
}

/** Replace a decision: new record pointing back at the old one, old one marked superseded, mission line swapped. */
export async function supersedeDecision(
  adapter: TrackerAdapter,
  mapId: string,
  decisionId: string,
  input: Omit<DecisionInput, 'question' | 'supersedes'> & { question?: string },
): Promise<DecisionRecord> {
  const all = await adapter.listDecisions(mapId);
  const old = all.find((d) => d.id === decisionId);
  if (!old) throw new OperationError(`decision ${decisionId} not found`);
  if (old.supersededBy) throw new OperationError(`${old.id} is already superseded by ${old.supersededBy}`);
  const rec = await adapter.createDecision(mapId, {
    ticketId: old.ticketId,
    ticketKey: old.ticketKey,
    ...input,
    question: input.question ?? old.question,
    supersedes: old.id,
  });
  await adapter.markSuperseded(mapId, old.id, rec.id);
  const fresh = await adapter.loadMap(mapId);
  const ds = fresh.map.sections.decisions;
  const i = ds.findIndex((x) => x.text === old.summary || (!!old.ticketId && x.ticketId === old.ticketId) || (!!old.ticketKey && x.ticketKey === old.ticketKey));
  const line = { ticketId: rec.ticketId, ticketKey: rec.ticketKey, text: rec.summary };
  await adapter.updateMapSections(mapId, { decisions: i < 0 ? [...ds, line] : ds.map((x, j) => (j === i ? line : x)) });
  return rec;
}

/** Turn a "Not yet specified" line into a real ticket, optionally blocked by existing tickets. */
export async function promoteToTicket(
  adapter: TrackerAdapter,
  mapId: string,
  entry: string,
  input: { type: TicketType; hitl?: boolean; title?: string; body?: string; blockedBy?: string[] },
) {
  const snap = await adapter.loadMap(mapId);
  if (!snap.map.sections.unspecified.includes(entry)) throw new OperationError(`"${entry}" is not in Not yet specified`);
  assertTypeAllowed(snap.map.mode, input.type);
  const t = await adapter.createTicket(mapId, {
    title: input.title ?? entry,
    type: input.type,
    hitl: input.hitl,
    body: `${input.body ?? `Promoted from Not yet specified: ${entry}`}\n\nPart of mission ${snap.map.key}.`,
  });
  for (const b of input.blockedBy ?? []) await adapter.addBlocking(mapId, b, t.id);
  const fresh = await adapter.loadMap(mapId);
  await adapter.updateMapSections(mapId, { unspecified: fresh.map.sections.unspecified.filter((f) => f !== entry) });
  return t;
}

export type ScopeTarget = { unspecified: string } | { ticketId: string };

/** Rule an unspecified line or an open ticket out of scope. */
export async function ruleOutOfScope(
  adapter: TrackerAdapter,
  mapId: string,
  target: ScopeTarget,
  input: { reason: string; author: string; source?: DecisionSource },
) {
  const snap = await adapter.loadMap(mapId);
  const { unspecified, outOfScope } = snap.map.sections;
  if ('unspecified' in target) {
    if (!unspecified.includes(target.unspecified)) throw new OperationError(`"${target.unspecified}" is not in Not yet specified`);
    await adapter.updateMapSections(mapId, {
      unspecified: unspecified.filter((f) => f !== target.unspecified),
      outOfScope: [...outOfScope, `${target.unspecified} — ${input.reason}`],
    });
    return;
  }
  const t = snap.tickets.find((x) => x.id === target.ticketId);
  if (!t) throw new OperationError(`ticket ${target.ticketId} not found`);
  await adapter.comment(mapId, t.id, input.author, `**Ruled out of scope**\n\n${input.reason}`);
  await adapter.close(mapId, t.id, 'not_planned');
  await recordDecision(
    adapter,
    mapId,
    { ticketId: t.id, ticketKey: t.key, question: t.title, answer: `Out of scope: ${input.reason}`, decidedBy: input.author, source: input.source ?? { kind: 'agent', label: input.author } },
    { appendToMission: false },
  );
  const fresh = await adapter.loadMap(mapId);
  await adapter.updateMapSections(mapId, {
    outOfScope: [...fresh.map.sections.outOfScope, `${t.key} ${t.title} — ${input.reason}`],
  });
}

/** Switch a map between plan+execute and plan-only. */
export async function setMapMode(adapter: TrackerAdapter, mapId: string, mode: MapMode) {
  await adapter.setMapMode(mapId, mode);
}

export function allowedTypes(mode: MapMode): TicketType[] {
  return mode === 'plan-only' ? TICKET_TYPES.filter((t) => t !== 'execute') : TICKET_TYPES;
}

function assertTypeAllowed(mode: MapMode, type: TicketType) {
  if (!allowedTypes(mode).includes(type)) throw new OperationError(`${type} tickets are disabled on plan-only maps`);
}

/** Drop execute tickets from a plan-only chart, re-pointing their dependants at their blockers. */
function withMode(plan: ChartPlan, mode: MapMode): ChartPlan & { mode: MapMode } {
  if (mode === 'plan+execute') return { ...plan, mode };
  const dropped = new Map(plan.tickets.filter((t) => t.type === 'execute').map((t) => [t.ref, t.blockedBy ?? []]));
  const expand = (refs: string[]): string[] => refs.flatMap((r) => (dropped.has(r) ? expand(dropped.get(r)!) : [r]));
  return {
    ...plan,
    mode,
    tickets: plan.tickets.filter((t) => !dropped.has(t.ref)).map((t) => ({ ...t, blockedBy: [...new Set(expand(t.blockedBy ?? []))] })),
  };
}
