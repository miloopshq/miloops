// M3 in the dev seed: the project's worktree setting (off here, so dev agents never create worktrees of this repo)
// and two live claims whose declared files overlap, so the queue shows an overlap and the inspector the touch-sets.
// The integration check needs real worktree branches, so it isn't seeded; verify-mcp drives it on a scratch repo.
import { claim, type MapDoc, type TicketLease, type TrackerAdapter } from '@miloops-hq/core';
import { writeLease, writeWorkspaceSettings } from '@miloops-hq/core/agents';

const DAY = 24 * 3_600_000;

interface SeedInput {
  root: string;
  adapter: TrackerAdapter;
  main: MapDoc;
  now: number;
}

const CLAIMS = [
  { title: 'Spike Automerge', agent: 'mpocock', touches: ['src/sync/**', 'package.json'], ago: 50 },
  {
    title: 'Show sync status in the note list',
    agent: 'codex-01',
    touches: ['src/sync/status.ts', 'src/notes/**'],
    ago: 12,
  },
];

/** A small ticket for the second claim, so the seed's ready tickets stay free for the dev agents. */
async function statusTicket(adapter: TrackerAdapter, main: MapDoc) {
  const snap = await adapter.loadMap(main.id);
  const found = snap.tickets.find((t) => t.title.startsWith(CLAIMS[1].title));
  if (found) return;
  await adapter.createTicket(main.id, {
    title: CLAIMS[1].title,
    type: 'execute',
    body: `Each note shows whether it is synced, waiting or in conflict.\n\nPart of mission ${main.key}.`,
  });
}

export async function seedParallel({ root, adapter, main, now }: SeedInput) {
  writeWorkspaceSettings(root, { v: 1, worktrees: false });
  await statusTicket(adapter, main);
  const snap = await adapter.loadMap(main.id);
  for (const c of CLAIMS) {
    const t = snap.tickets.find((x) => x.title.startsWith(c.title) && x.state === 'open');
    if (!t) continue;
    if (t.assignee !== c.agent) await claim(adapter, main.id, t.id, { assignee: c.agent }).catch(() => undefined);
    const at = now - c.ago * 60_000;
    const lease: TicketLease = {
      v: 1,
      mapId: main.id,
      ticketId: t.id,
      ticketKey: t.key,
      agent: c.agent,
      pid: process.pid,
      claimedAt: at,
      renewedAt: now,
      // A week, so the seeded claims stay live while you look around; a real lease is 15 minutes.
      ttlMs: 7 * DAY,
      expiresAt: now + 7 * DAY,
      notes: [],
      decisions: [],
      touches: c.touches,
    };
    writeLease(root, lease);
  }
}
