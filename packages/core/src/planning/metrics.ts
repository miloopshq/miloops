import type { ActivityState } from '../activity/activityStream';
import {
  TICKET_TYPES,
  type MapSnapshot,
  type NodeState,
  type SessionInfo,
  type SessionUsage,
  type Ticket,
  type TicketType,
  type UsageSource,
} from '../model/types';
import { deriveStates } from './derive';

export { eventPulse, monitorTracker, type TrackerHealth, type TrackerMonitor } from './trackerHealth';

/*
 * Named metrics behind every HUD widget. Each one is a pure function of
 * tracker state (MapSnapshot), the activity stream (ActivityState) or the
 * tracker monitor (TrackerHealth). Demo mode feeds simulated sessions and an
 * in-memory tracker through the same inputs, so widgets go live unchanged
 * once real agents and trackers are wired in.
 */

const HOUR = 3_600_000;

export type StateCounts = Record<NodeState, number> & { total: number; resolvedPct: number };

/** `metrics.stateCounts`: tickets per derived state, plus % resolved (decided or ruled out). */
export function stateCounts(snap: MapSnapshot): StateCounts {
  const c: StateCounts = {
    decided: 0,
    claimed: 0,
    frontier: 0,
    blocked: 0,
    parked: 0,
    'out-of-scope': 0,
    total: snap.tickets.length,
    resolvedPct: 0,
  };
  for (const s of deriveStates(snap.tickets, snap.map.mode).values()) c[s]++;
  c.resolvedPct = c.total ? Math.round(((c.decided + c['out-of-scope']) / c.total) * 100) : 0;
  return c;
}

/** `metrics.progress`: decided out of in-scope tickets (header readout, mission switcher). */
export function missionProgress(snap: MapSnapshot) {
  const c = stateCounts(snap);
  return { decided: c.decided, total: c.total - c['out-of-scope'] };
}

/** `metrics.criticalPath`: the longest chain of open tickets linked by blocking edges. */
export function criticalPath(snap: MapSnapshot): Ticket[] {
  const open = new Map(snap.tickets.filter((t) => t.state === 'open').map((t) => [t.id, t]));
  const memo = new Map<string, Ticket[]>();
  const visiting = new Set<string>();
  const chain = (id: string): Ticket[] => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return [];
    visiting.add(id);
    const t = open.get(id)!;
    let best: Ticket[] = [];
    for (const b of t.blockedBy)
      if (open.has(b)) {
        const c = chain(b);
        if (c.length > best.length) best = c;
      }
    visiting.delete(id);
    const out = [...best, t];
    memo.set(id, out);
    return out;
  };
  let longest: Ticket[] = [];
  for (const id of open.keys()) {
    const c = chain(id);
    if (c.length > longest.length) longest = c;
  }
  return longest;
}

const closedAt = (t: Ticket) => t.closedAt ?? t.updatedAt;

export interface Throughput {
  /** Tickets decided in the last hour (rolling). */
  lastHour: number;
  /** Decided per bucket across the mission's lifetime. */
  decided: number[];
  /** Open tickets at the end of each bucket (burndown). */
  open: number[];
  bucketMs: number;
}

/** `metrics.throughput`: decisions per hour and the open-ticket burndown since the mission was created. */
export function throughput(snap: MapSnapshot, now = Date.now(), buckets = 16): Throughput {
  const start = Math.min(snap.map.createdAt, ...snap.tickets.map((t) => t.createdAt));
  const bucketMs = Math.max(now - start, 60_000) / buckets;
  const decided = new Array<number>(buckets).fill(0);
  const open = new Array<number>(buckets).fill(0);
  const done = snap.tickets.filter((t) => t.state === 'closed' && t.closeReason === 'completed');
  for (const t of done) decided[Math.min(buckets - 1, Math.max(0, Math.floor((closedAt(t) - start) / bucketMs)))]++;
  for (let i = 0; i < buckets; i++) {
    const end = start + (i + 1) * bucketMs;
    open[i] = snap.tickets.filter((t) => t.createdAt <= end && (t.state === 'open' || closedAt(t) > end)).length;
  }
  return { lastHour: done.filter((t) => now - closedAt(t) <= HOUR).length, decided, open, bucketMs };
}

/** `metrics.typeMix`: tickets per type, split into open and closed. */
export function typeMix(snap: MapSnapshot): { type: TicketType; open: number; closed: number }[] {
  return TICKET_TYPES.map((type) => {
    const ts = snap.tickets.filter((t) => t.type === type);
    return {
      type,
      open: ts.filter((t) => t.state === 'open').length,
      closed: ts.filter((t) => t.state === 'closed').length,
    };
  }).filter((r) => r.open + r.closed > 0);
}

/** `metrics.claimsByAgent`: open tickets per assignee (agents and humans). */
export function claimsByAgent(snap: MapSnapshot): { agent: string; count: number }[] {
  const m = new Map<string, number>();
  for (const t of snap.tickets) if (t.state === 'open' && t.assignee) m.set(t.assignee, (m.get(t.assignee) ?? 0) + 1);
  return [...m]
    .map(([agent, count]) => ({ agent, count }))
    .sort((a, b) => b.count - a.count || a.agent.localeCompare(b.agent));
}

export interface HitlStats {
  open: number;
  /** When the oldest open question was asked. */
  oldestAt?: number;
  answered: number;
  /** Mean time a question waited on the human before it was answered. */
  avgWaitMs?: number;
}

/** `metrics.hitl`: queue depth, oldest inbox item and average response time (all missions unless filtered). */
export function hitlStats(activity: ActivityState, mapId?: string): HitlStats {
  const pending = activity.pending.filter((q) => !mapId || q.mapId === mapId);
  const answered = activity.answered.filter((q) => !mapId || q.mapId === mapId);
  return {
    open: pending.length,
    oldestAt: pending.length ? Math.min(...pending.map((q) => q.at)) : undefined,
    answered: answered.length,
    avgWaitMs: answered.length
      ? answered.reduce((s, q) => s + (q.answeredAt - q.askedAt), 0) / answered.length
      : undefined,
  };
}

/** `metrics.usage`: model tokens and cost for one mission, cumulative across its sessions. */
export function missionUsage(activity: ActivityState, mapId: string | undefined): SessionUsage {
  return (mapId && activity.usageByMap[mapId]) || { inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

export const sessionTokens = (s: Pick<SessionInfo, 'usage'>) =>
  s.usage ? s.usage.inputTokens + s.usage.outputTokens : 0;

/** Short tag and explanation per usage source: `LOG` is measured from the agent's own log, `SELF` is the agent's report. */
export const USAGE_SOURCE: Record<UsageSource, { tag: string; text: string }> = {
  'claude-code': { tag: 'LOG', text: 'Measured from the Claude Code session transcript; cost at list price' },
  codex: { tag: 'LOG', text: 'Measured from the Codex session log; cost at list price' },
  reported: { tag: 'SELF', text: 'Self-reported by the agent (report_progress)' },
};

/** Sources behind a mission's usage, from the sessions still in view. */
export function missionUsageSources(activity: ActivityState, mapId: string | undefined): UsageSource[] {
  const seen = new Set<UsageSource>();
  for (const s of activity.sessions) if (mapId && s.mapId === mapId && s.usage?.source) seen.add(s.usage.source);
  return [...seen].sort();
}

/** Tooltip for a session's usage: tokens in/out, cached input, models and where the numbers come from. */
export function usageDetail(u: SessionUsage) {
  const parts = [
    `${u.inputTokens.toLocaleString()} in${u.cachedInputTokens ? ` (${u.cachedInputTokens.toLocaleString()} cached)` : ''} · ${u.outputTokens.toLocaleString()} out`,
  ];
  if (u.models?.length) parts.push(u.models.join(', '));
  if (u.source) parts.push(USAGE_SOURCE[u.source].text);
  return parts.join('\n');
}
