import type { ActivityState } from '../activity/activityStream';
import { attention, deriveStates } from './derive';
import type { UsageLedger } from '../activity/presence';
import type { DecisionRecord, MapSnapshot, PendingQuestion, SessionInfo, SessionUsage, Ticket } from '../model/types';

export interface MissionBriefing {
  mapId: string;
  key: string;
  title: string;
  since: number;
  /** Closed as completed since `since`. */
  done: Ticket[];
  ruledOut: Ticket[];
  /** Tickets created since `since`. */
  opened: Ticket[];
  /** Blocked tickets held up by a ticket that needs a human. */
  blocked: { ticket: Ticket; on: Ticket[] }[];
  /** Questions agents are blocked on now, oldest first (whenever they were asked). */
  waiting: PendingQuestion[];
  /** Every decision recorded since `since`; `agentDecisions` is the subset an agent made. */
  decisions: DecisionRecord[];
  agentDecisions: DecisionRecord[];
  usage: SessionUsage & { sessions: number };
  active: SessionInfo[];
  /** Anything happened since `since` (waiting questions alone count only if asked since). */
  changed: boolean;
}

export interface Briefing {
  /** Earliest `since` across the missions shown. */
  since: number;
  now: number;
  /** Missions with changes, the current one first. */
  missions: MissionBriefing[];
  totals: {
    done: number;
    ruledOut: number;
    blocked: number;
    waiting: number;
    oldestWaitMs?: number;
    agentDecisions: number;
    usage: SessionUsage & { sessions: number };
    active: number;
  };
  changed: boolean;
}

export interface BriefingInput {
  snaps: MapSnapshot[];
  decisions: DecisionRecord[];
  activity: ActivityState;
  ledger?: UsageLedger;
  /** Last-seen time per mission (see `Presence`). */
  since: (mapId: string) => number;
  currentMapId?: string;
  now?: number;
}

/** `metrics.briefing`: what changed in each mission since the operator was last present. */
export function buildBriefing(input: BriefingInput): Briefing {
  const now = input.now ?? Date.now();
  const missions = input.snaps.map((snap): MissionBriefing => {
    const mapId = snap.map.id;
    const since = input.since(mapId);
    const after = (t?: number) => !!t && t >= since;
    const states = deriveStates(snap.tickets, snap.map.mode);
    const byId = new Map(snap.tickets.map((t) => [t.id, t]));
    const waiting = input.activity.pending.filter((q) => q.mapId === mapId).sort((a, b) => a.at - b.at);
    const waitingTickets = new Set(waiting.map((q) => q.ticketId));
    const needsHuman = (t: Ticket) => t.state === 'open' && (waitingTickets.has(t.id) || attention(t) === 'hitl');
    const blocked = snap.tickets
      .filter((t) => states.get(t.id) === 'blocked')
      .map((t) => ({ ticket: t, on: t.blockedBy.map((b) => byId.get(b)).filter((b): b is Ticket => !!b && needsHuman(b)) }))
      .filter((b) => b.on.length);
    const decisions = input.decisions.filter((d) => d.mapId === mapId && after(d.decidedAt)).sort((a, b) => b.decidedAt - a.decidedAt);
    const closed = snap.tickets.filter((t) => t.state === 'closed' && after(t.closedAt)).sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));
    const done = closed.filter((t) => t.closeReason === 'completed');
    const ruledOut = closed.filter((t) => t.closeReason === 'not_planned');
    const opened = snap.tickets.filter((t) => after(t.createdAt));
    const usage = input.ledger?.since(mapId, since) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0, sessions: 0 };
    const active = input.activity.sessions.filter((s) => s.mapId === mapId && s.status === 'running');
    return {
      mapId,
      key: snap.map.key,
      title: snap.map.title,
      since,
      done,
      ruledOut,
      opened,
      blocked,
      waiting,
      decisions,
      agentDecisions: decisions.filter((d) => d.source.kind === 'agent'),
      usage,
      active,
      changed: !!(closed.length || opened.length || decisions.length || waiting.some((q) => after(q.at)) || usage.costUsd > 0),
    };
  });
  const shown = missions.filter((m) => m.changed || m.waiting.length).sort((a, b) => (a.mapId === input.currentMapId ? -1 : b.mapId === input.currentMapId ? 1 : 0));
  const sum = <K extends 'done' | 'ruledOut' | 'blocked' | 'waiting' | 'agentDecisions' | 'active'>(k: K) => shown.reduce((n, m) => n + m[k].length, 0);
  const oldest = shown.flatMap((m) => m.waiting).reduce<number | undefined>((o, q) => (o === undefined || q.at < o ? q.at : o), undefined);
  return {
    since: shown.length ? Math.min(...shown.map((m) => m.since)) : now,
    now,
    missions: shown,
    totals: {
      done: sum('done'),
      ruledOut: sum('ruledOut'),
      blocked: sum('blocked'),
      waiting: sum('waiting'),
      oldestWaitMs: oldest === undefined ? undefined : now - oldest,
      agentDecisions: sum('agentDecisions'),
      usage: shown.reduce(
        (u, m) => ({ inputTokens: u.inputTokens + m.usage.inputTokens, outputTokens: u.outputTokens + m.usage.outputTokens, costUsd: u.costUsd + m.usage.costUsd, sessions: u.sessions + m.usage.sessions }),
        { inputTokens: 0, outputTokens: 0, costUsd: 0, sessions: 0 },
      ),
      active: sum('active'),
    },
    changed: missions.some((m) => m.changed),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** MILO's spoken summary of a briefing. Deterministic; built only from the briefing's numbers. */
export function briefingLine(b: Briefing, hour = new Date(b.now).getHours()): string {
  const t = b.totals;
  const away = b.now - b.since;
  const greeting = away >= 6 * 3_600_000 && hour >= 5 && hour < 12 ? 'Good morning.' : 'Welcome back.';
  const parts: string[] = [];
  if (t.done) parts.push(`${plural(t.done, 'ticket')} ${t.done === 1 ? 'is' : 'are'} done.`);
  if (t.agentDecisions) parts.push(`Agents made ${plural(t.agentDecisions, 'decision')}.`);
  if (t.waiting) {
    const held = b.missions.flatMap((m) => m.blocked.filter((x) => x.on.some((o) => m.waiting.some((q) => q.ticketId === o.id))));
    const hold = held.length === 1 ? `, and it holds up ${held[0].ticket.title.replace(/^./, (c) => c.toLowerCase())}` : held.length > 1 ? `, holding up ${plural(held.length, 'ticket')}` : '';
    parts.push(`${plural(t.waiting, 'decision')} ${t.waiting === 1 ? 'is' : 'are'} waiting on you${hold}.`);
  } else parts.push('Nothing is waiting on you.');
  if (!t.done && !t.agentDecisions && t.ruledOut) parts.unshift(`${plural(t.ruledOut, 'ticket')} ruled out of scope.`);
  return [greeting, ...parts].join(' ');
}
