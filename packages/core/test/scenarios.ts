import { chartMap, claim, resolve, setMapMode, supersedeDecision } from '../src/planning/operations';
import type { SyncedAdapter } from '../src/adapters/remote/sync/syncedAdapter';
import type { TrackerEvent } from '../src/model/types';

/** Request bodies embed timestamps (decision records), so recordings and replays run at one fixed instant. */
export const FROZEN = Date.UTC(2026, 9, 31, 12, 0, 0);
export function freezeTime() {
  const real = Date.now;
  Date.now = () => FROZEN;
  return () => (Date.now = real);
}

export const noSleep = { sleep: async () => {} };

const SECTIONS = {
  destination: 'Edits made offline sync without data loss.',
  notes: '',
  decisions: [],
  unspecified: ['Conflict policy for deletes'],
  outOfScope: [],
};

/** Chart → claim → comment → resolve (decision) → supersede → plan-only, then read it all back with a fresh adapter. */
export async function missionFlow(make: () => SyncedAdapter) {
  const a = make();
  const before = await a.listMaps();
  const { map, tickets } = await chartMap(a, {
    title: 'Ship offline sync',
    sections: SECTIONS,
    tickets: [
      { ref: 'r', title: 'Survey CRDT libraries', type: 'research', body: 'Compare Automerge and Yjs.' },
      { ref: 'g', title: 'Pick a conflict policy', type: 'grilling', body: 'Last-writer-wins or merge?', blockedBy: ['r'] },
    ],
  });
  const [r, g] = tickets;
  await claim(a, map.id, r.id, 'claude-07');
  await a.comment(map.id, r.id, 'claude-07', 'Yjs has the smaller bundle.');
  await resolve(a, map.id, r.id, { answer: 'Use Yjs. It has the smaller bundle and mature offline support.', author: 'claude-07' });
  const [d1] = await a.listDecisions(map.id);
  const d2 = await supersedeDecision(a, map.id, d1.id, { answer: 'Use Automerge. Its history model fits the audit trail.', decidedBy: 'operator', source: { kind: 'command-center' } });
  await setMapMode(a, map.id, 'plan-only');
  const cached = await a.loadMap(map.id);

  const b = make();
  const maps = await b.listMaps();
  const snap = await b.loadMap(map.id);
  const decisions = await b.listDecisions(map.id);
  return { before, map, r, g, d1, d2, cached, maps, snap, decisions };
}

/** Changes made by a person in the tracker reach subscribers; an idle tracker costs nothing. */
export async function syncFlow(make: () => SyncedAdapter, human: { act(ticketRef: string): void }) {
  const a = make();
  const { map, tickets } = await chartMap(a, { title: 'Ship offline sync', sections: SECTIONS, tickets: [{ ref: 'r', title: 'Survey CRDT libraries', type: 'research', body: 'Compare.' }] });
  const events: TrackerEvent[] = [];
  a.subscribe((e) => events.push(e));
  await a.tick();
  const quiet = events.length;
  human.act(tickets[0].id);
  await a.tick();
  const after = await a.loadMap(map.id);
  const seen = events.slice(quiet);
  await a.tick();
  return { map, ticket: tickets[0], quiet, seen, idle: events.length - quiet - seen.length, after };
}

/** Another process (an MCP agent) charts a mission after this adapter listed missions but before its first poll. */
export async function lateMissionFlow(make: () => SyncedAdapter) {
  const a = make();
  const before = await a.listMaps();
  const events: TrackerEvent[] = [];
  a.subscribe((e) => events.push(e));
  const { map } = await chartMap(make(), { title: 'Charted by an agent', sections: SECTIONS, tickets: [{ ref: 'r', title: 'Survey CRDT libraries', type: 'research', body: 'Compare.' }] });
  await a.tick();
  const after = await a.listMaps();
  const second = await chartMap(make(), { title: 'Charted after the first poll', sections: SECTIONS, tickets: [] });
  await a.tick();
  return { before, map, after, second: second.map, later: await a.listMaps(), events };
}

/** Network drops mid-mission: writes queue, reads serve the cache, creates fail fast, the queue drains on reconnect. */
export async function offlineFlow(make: () => SyncedAdapter, net: { offline(on: boolean): void }) {
  const a = make();
  const { map, tickets } = await chartMap(a, { title: 'Ship offline sync', sections: SECTIONS, tickets: [{ ref: 'r', title: 'Survey CRDT libraries', type: 'research', body: 'Compare.' }] });
  const t = tickets[0];
  net.offline(true);
  await a.comment(map.id, t.id, 'claude-07', 'Queued while offline.');
  await a.assign(map.id, t.id, 'claude-07');
  const offline = { ...a.status };
  const cached = await a.loadMap(map.id);
  const createError = await a.createTicket(map.id, { title: 'More', type: 'task', body: '' }).then(
    () => undefined,
    (e: Error & { code?: string }) => e.code,
  );
  await a.tick();
  const stillOffline = { ...a.status };
  net.offline(false);
  await a.tick();
  const online = { ...a.status };
  const fresh = await make().loadMap(map.id);
  return { offline, cached, createError, stillOffline, online, fresh, ticket: t };
}

/** A short secondary limit is absorbed by retrying; a long primary limit queues writes until the window resets. */
export async function rateLimitFlow(make: () => SyncedAdapter, net: { limit(kind: 'short' | 'long' | null): void }) {
  const a = make();
  const { map, tickets } = await chartMap(a, { title: 'Ship offline sync', sections: SECTIONS, tickets: [{ ref: 'r', title: 'Survey CRDT libraries', type: 'research', body: 'Compare.' }] });
  const t = tickets[0];
  net.limit('short');
  await a.comment(map.id, t.id, 'claude-07', 'Retried after a secondary limit.');
  const afterShort = { ...a.status };
  net.limit('long');
  await a.comment(map.id, t.id, 'claude-07', 'Sent after the window reset.');
  const limited = { ...a.status };
  net.limit(null);
  await a.tick();
  const resumed = { ...a.status };
  const fresh = await make().loadMap(map.id);
  return { afterShort, limited, resumed, fresh, ticket: t };
}
