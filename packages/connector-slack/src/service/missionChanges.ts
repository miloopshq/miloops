import { deriveStates, type AgentSessionDoc, type MapSnapshot, type Ticket } from '@miloops-hq/core';
import { escape } from '../blocks';
import { briefMission, formatTokens } from '../status';
import type { MissionNotes } from './types';

/** What the notifier remembers about a mission between ticks. */
export function notesOf(snap: MapSnapshot): MissionNotes {
  const states = deriveStates(snap.tickets, snap.map.mode);
  return {
    known: new Set(snap.tickets.map((t) => t.id)),
    blocked: new Set(snap.tickets.filter((t) => states.get(t.id) === 'blocked').map((t) => t.id)),
    closed: new Set(snap.tickets.filter((t) => t.state === 'closed').map((t) => t.id)),
    done: snap.tickets.length > 0 && snap.tickets.every((t) => t.state === 'closed'),
  };
}

interface Change {
  snap: MapSnapshot;
  docs: AgentSessionDoc[];
  prev: MissionNotes;
  now: MissionNotes;
  events: Set<string>;
}

/** The Slack lines for what changed since the last tick: newly blocked, resolved, mission done. */
export function missionChanges(c: Change): string[] {
  const byId = new Map(c.snap.tickets.map((t) => [t.id, t]));
  const title = escape(c.snap.map.title);
  const lines: string[] = [];
  if (c.events.has('blocked')) lines.push(...newlyBlocked(c, byId).map((t) => blockedLine(title, t, byId)));
  if (c.events.has('resolved')) lines.push(...newlyResolved(c, byId).map((t) => resolvedLine(c, title, t, byId)));
  if (c.events.has('mission.done') && c.now.done && !c.prev.done) {
    const b = briefMission(c.snap, c.docs);
    lines.push(
      `◉ *MISSION DONE* · ${title} · ${b.total} tickets · $${b.costUsd.toFixed(2)} · ${formatTokens(b.tokens)} tokens`,
    );
  }
  return lines;
}

const newlyBlocked = (c: Change, byId: Map<string, Ticket>) =>
  [...c.now.blocked].filter((id) => c.prev.known.has(id) && !c.prev.blocked.has(id)).map((id) => byId.get(id)!);

const newlyResolved = (c: Change, byId: Map<string, Ticket>) =>
  [...c.now.closed]
    .filter((id) => !c.prev.closed.has(id) && byId.get(id)?.closeReason === 'completed')
    .map((id) => byId.get(id)!);

function blockedLine(title: string, t: Ticket, byId: Map<string, Ticket>): string {
  const by = t.blockedBy
    .map((b) => byId.get(b))
    .filter((b): b is Ticket => b?.state === 'open')
    .map((b) => `${b.key} ${b.title}`);
  const blockers = by.length ? ` is blocked by ${escape(by.join(', '))}` : '';
  return `⛔ *BLOCKED* · ${title} · ${escape(t.key)} ${escape(t.title)}${blockers}`;
}

function resolvedLine(c: Change, title: string, t: Ticket, byId: Map<string, Ticket>): string {
  const unblocked = [...c.prev.blocked].filter((b) => {
    const other = byId.get(b);
    return !c.now.blocked.has(b) && other?.state === 'open' && other.blockedBy.includes(t.id);
  }).length;
  const plural = unblocked === 1 ? '' : 's';
  const opened = unblocked ? ` → ${unblocked} ticket${plural} unblocked` : '';
  return `✓ *RESOLVED* · ${title} · ${escape(t.key)} ${escape(t.title)}${opened}`;
}
