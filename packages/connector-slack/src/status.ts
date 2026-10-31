import { BRAND, deriveStates, frontier, type AgentSessionDoc, type MapSnapshot } from '@miloops-hq/core';
import { escape, md, plain } from './blocks';

export interface MissionBrief {
  id: string;
  key: string;
  title: string;
  mode: string;
  resolved: number;
  total: number;
  awaiting: { key?: string; agent: string; text: string; at: number }[];
  blocked: { key: string; by: string[] }[];
  frontier: { key: string; title: string }[];
  sessions: { agent: string; status: string }[];
  costUsd: number;
  tokens: number;
}

export function briefMission(snap: MapSnapshot, docs: AgentSessionDoc[]): MissionBrief {
  const states = deriveStates(snap.tickets, snap.map.mode);
  const byId = new Map(snap.tickets.map((t) => [t.id, t]));
  const mine = docs.filter((d) => d.session.mapId === snap.map.id);
  return {
    id: snap.map.id,
    key: snap.map.key,
    title: snap.map.title,
    mode: snap.map.mode,
    resolved: snap.tickets.filter((t) => t.state === 'closed').length,
    total: snap.tickets.length,
    awaiting: mine.flatMap((d) => d.pending).map((q) => ({ key: q.ticketId ? byId.get(q.ticketId)?.key : undefined, agent: q.agent, text: q.text, at: q.at })),
    blocked: snap.tickets
      .filter((t) => states.get(t.id) === 'blocked')
      .map((t) => ({ key: t.key, by: t.blockedBy.map((b) => byId.get(b)).filter((b) => b && b.state === 'open').map((b) => b!.key) })),
    frontier: frontier(snap.tickets, snap.map.mode).map((t) => ({ key: t.key, title: t.title })),
    sessions: mine.filter((d) => d.session.status === 'running').map((d) => ({ agent: d.session.agent, status: d.pending.length || d.session.waitingOn ? 'waiting' : 'active' })),
    costUsd: mine.reduce((n, d) => n + (d.session.usage?.costUsd ?? 0), 0),
    tokens: mine.reduce((n, d) => n + (d.session.usage ? d.session.usage.inputTokens + d.session.usage.outputTokens : 0), 0),
  };
}

export const formatTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
const since = (at: number, now: number) => {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  return m < 60 ? `${m}m` : `${Math.round(m / 60)}h`;
};
const list = (xs: string[], n = 3) => (xs.length > n ? [...xs.slice(0, n), '…'] : xs).join(', ');

export function statusBlocks(b: MissionBrief, o: { now: number; url?: string }) {
  const rows = [
    `*${escape(b.title.toUpperCase())}* · ${b.mode} · ${b.resolved}/${b.total} resolved`,
    '```',
    `Awaiting you  ${b.awaiting.length}${b.awaiting.length ? `  (${list(b.awaiting.map((a) => `${a.key ?? a.agent}, ${since(a.at, o.now)}`))})` : ''}`,
    `Blocked       ${b.blocked.length}${b.blocked.length ? `  (${list(b.blocked.map((x) => (x.by.length ? `${x.key} by ${x.by.join('+')}` : x.key)))})` : ''}`,
    `Frontier      ${b.frontier.length}${b.frontier.length ? `  (${list(b.frontier.map((f) => `${f.key} ${f.title}`))})` : ''}`,
    `Sessions      ${b.sessions.length ? b.sessions.map((s) => `${s.agent} ${s.status}`).join(', ') : 'none'} · $${b.costUsd.toFixed(2)} · ${formatTokens(b.tokens)} tok`,
    '```',
  ];
  return {
    text: `${b.title}: ${b.resolved}/${b.total} resolved, ${b.awaiting.length} awaiting you, ${b.blocked.length} blocked`,
    blocks: [
      { type: 'section', text: md(rows.join('\n')) },
      ...(o.url ? [{ type: 'actions', elements: [{ type: 'button', action_id: 'open_miloops', text: plain(`Open in ${BRAND.name}`), url: o.url }] }] : []),
    ],
  };
}

export function missionListBlocks(briefs: MissionBrief[], command: string) {
  if (!briefs.length) return { text: 'No missions yet.', blocks: [{ type: 'section', text: md(`No missions yet. Start one in ${BRAND.name}.`) }] };
  const lines = briefs.map((b) => `*${escape(b.key)}* ${escape(b.title)} · ${b.resolved}/${b.total} · ${b.awaiting.length} awaiting · ${b.blocked.length} blocked`);
  return {
    text: `${briefs.length} missions`,
    blocks: [
      { type: 'section', text: md(lines.join('\n')) },
      { type: 'context', elements: [md(`\`${command} status <mission>\` for one mission`)] },
    ],
  };
}
