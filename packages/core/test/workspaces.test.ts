import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_MODE,
  MemoryAdapter,
  addIntegrationTicket,
  buildAttention,
  findIntegrations,
  globsOverlap,
  integrationTicketFor,
  parseWorkspaceSettings,
  touchOverlaps,
  type AttentionInput,
  type MapSnapshot,
  type TicketLease,
  type WorkspaceRecord,
} from '../src';
import { listWorkspaces, prepareWorktree, readIntegrationScan, scanIntegrations, writeLease } from '../src/agentHost';

const now = Date.UTC(2026, 11, 1, 12);
const dirs: string[] = [];
const tmp = (name: string) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `teamtrail-${name}-`));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A repo with one commit and a tracker folder inside it, like a user's project. */
function repo() {
  const top = path.join(tmp('repo'), 'app');
  fs.mkdirSync(path.join(top, '.teamtrail'), { recursive: true });
  sh(top, 'init', '-q', '-b', 'main');
  sh(top, 'config', 'user.email', 't@t');
  sh(top, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(top, 'a.txt'), 'a\n');
  sh(top, 'add', '-A');
  sh(top, 'commit', '-qm', 'init');
  return { top, root: path.join(top, '.teamtrail') };
}

function lease(ticketId: string, patch: Partial<TicketLease> = {}): TicketLease {
  return {
    v: 1,
    mapId: 'm1',
    ticketId,
    ticketKey: `#${ticketId}`,
    agent: `agent-${ticketId}`,
    pid: 1,
    claimedAt: now,
    renewedAt: now,
    ttlMs: 15 * 60_000,
    expiresAt: now + 15 * 60_000,
    notes: [],
    decisions: [],
    ...patch,
  };
}

describe('touch-sets', () => {
  it('overlap when globs can name the same file, and explain which', () => {
    expect(globsOverlap('src/app/**', 'src/app/main.ts')).toBe(true);
    expect(globsOverlap('src/**', 'src/app/*.ts')).toBe(true);
    expect(globsOverlap('src/app/**', 'src/billing/**')).toBe(false);
    expect(globsOverlap('package.json', 'package.json')).toBe(true);
    expect(globsOverlap('package.json', 'docs/**')).toBe(false);
    const o = touchOverlaps(
      { mapId: 'm1', ticketId: '2', touches: ['src/app/main.ts'] },
      [
        lease('1', { touches: ['src/app/**'] }),
        lease('3', { touches: ['docs/**'] }),
        lease('4', { touches: ['src/**'], returned: { at: now, reason: 'trail lead', by: 'op' } }),
      ],
      now,
    );
    expect(o).toEqual([
      { mapId: 'm1', ticketId: '1', ticketKey: '#1', agent: 'agent-1', pairs: [['src/app/main.ts', 'src/app/**']] },
    ]);
  });
});

describe('workspace settings', () => {
  it('parse, list every error, and default to off', () => {
    expect(parseWorkspaceSettings('{"v":1,"worktrees":true}').settings).toEqual({ v: 1, worktrees: true });
    expect(parseWorkspaceSettings('{"v":1}').settings).toEqual({ v: 1, worktrees: false });
    expect(parseWorkspaceSettings('{"v":2,"worktrees":"yes","x":1}').errors).toEqual([
      'unknown key "x"',
      '"v" must be 1',
      '"worktrees" must be true or false',
    ]);
  });
});

describe('worktrees', () => {
  it('are created next to the repo on their own branch, reused on reclaim, and explained when impossible', async () => {
    const { top, root } = repo();
    const at = {
      root,
      repoRoot: top,
      settings: { v: 1 as const, worktrees: true },
      mapId: 'Release search',
      ticket: { id: '7', key: '#7' },
      agent: 'claude-01',
      now,
    };
    const first = await prepareWorktree(at);
    if (!('workspace' in first)) throw new Error(first.note);
    expect(first.workspace.branch).toBe('teamtrail/release-search/7');
    expect(fs.realpathSync(first.workspace.path)).toBe(
      fs.realpathSync(path.join(top, '..', 'app.teamtrail', 'release-search-7')),
    );
    expect(sh(first.workspace.path, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('teamtrail/release-search/7');
    expect(first.workspace.base).toBe(sh(top, 'rev-parse', 'HEAD'));
    expect(await prepareWorktree(at)).toEqual(first);
    expect(listWorkspaces(root).map((w) => w.ticketKey)).toEqual(['#7']);
    const plain = tmp('plain');
    const none = await prepareWorktree({ ...at, root: plain, repoRoot: plain });
    expect('note' in none && none.note).toMatch(/not a git repository/);
  });

  it('report real overlaps between active claim branches, and the integration ticket ends the suggestion', async () => {
    const { top, root } = repo();
    const settings = { v: 1 as const, worktrees: true };
    const made: WorkspaceRecord['path'][] = [];
    for (const id of ['1', '2']) {
      const p = await prepareWorktree({
        root,
        repoRoot: top,
        settings,
        mapId: 'm1',
        ticket: { id, key: `#${id}` },
        agent: `agent-${id}`,
        now,
      });
      if (!('workspace' in p)) throw new Error(p.note);
      made.push(p.workspace.path);
      writeLease(root, lease(id));
      fs.writeFileSync(path.join(p.workspace.path, 'shared.txt'), `from ${id}\n`);
      fs.writeFileSync(path.join(p.workspace.path, `only-${id}.txt`), 'x\n');
      sh(p.workspace.path, 'add', '-A');
      sh(p.workspace.path, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', `work ${id}`);
    }
    const scan = await scanIntegrations(root, now);
    expect(scan.overlaps.map((o) => [o.tickets.map((t) => t.ticketKey), o.files])).toEqual([
      [['#1', '#2'], ['shared.txt']],
    ]);
    expect(readIntegrationScan(root)).toEqual(scan);

    const adapter = new MemoryAdapter({ latency: [0, 0] });
    const map = await adapter.createMap({ title: 'M', sections: {} as MapSnapshot['map']['sections'] });
    const a = await adapter.createTicket(map.id, { title: 'A', type: 'execute', body: '' });
    const b = await adapter.createTicket(map.id, { title: 'B', type: 'execute', body: '' });
    const overlap = {
      ...scan.overlaps[0],
      mapId: map.id,
      tickets: [
        { ...scan.overlaps[0].tickets[0], ticketId: a.id },
        { ...scan.overlaps[0].tickets[1], ticketId: b.id },
      ] as (typeof scan.overlaps)[0]['tickets'],
    };
    const t = await addIntegrationTicket(adapter, overlap);
    const snap = await adapter.loadMap(map.id);
    expect(integrationTicketFor(snap.tickets, overlap)?.id).toBe(t.id);
    expect(snap.tickets.find((x) => x.id === t.id)?.blockedBy.sort()).toEqual([a.id, b.id].sort());
    await expect(addIntegrationTicket(adapter, overlap)).rejects.toThrow(/already exists/);
  });

  it('find overlaps only inside a trail, deterministically', () => {
    const ws = (mapId: string, ticketId: string): WorkspaceRecord => ({
      v: 1,
      mapId,
      ticketId,
      ticketKey: `#${ticketId}`,
      agent: 'a',
      path: '/x',
      branch: `b${ticketId}`,
      base: 'h',
      createdAt: now,
    });
    const found = findIntegrations([
      { ws: ws('m1', '3'), files: ['b.ts', 'a.ts'] },
      { ws: ws('m2', '1'), files: ['a.ts'] },
      { ws: ws('m1', '2'), files: ['a.ts', 'b.ts', 'c.ts'] },
    ]);
    expect(found).toEqual([
      {
        mapId: 'm1',
        tickets: [
          { ticketId: '2', ticketKey: '#2', agent: 'a', branch: 'b2' },
          { ticketId: '3', ticketKey: '#3', agent: 'a', branch: 'b3' },
        ],
        files: ['a.ts', 'b.ts'],
      },
    ]);
  });
});

describe('attention', () => {
  const snap = (): MapSnapshot => ({
    map: {
      id: 'm1',
      key: '#1',
      title: 'M',
      mode: DEFAULT_MAP_MODE,
      sections: {} as MapSnapshot['map']['sections'],
      createdAt: now,
      updatedAt: now,
    },
    tickets: ['1', '2'].map((id) => ({
      id,
      key: `#${id}`,
      title: `T${id}`,
      type: 'execute',
      body: '',
      state: 'open',
      blockedBy: [],
      comments: [],
      createdAt: now,
      updatedAt: now,
    })),
  });
  const input = (patch: Partial<AttentionInput>): AttentionInput => ({
    snaps: [snap()],
    questions: [],
    sessions: [],
    approvals: [],
    syncs: [],
    leases: [],
    knowledge: [],
    briefs: [],
    now,
    ...patch,
  });

  it('shows one overlap item per pair of claims, on the newer claim, with the files', () => {
    const q = buildAttention(
      input({
        leases: [lease('1', { touches: ['src/**'] }), lease('2', { claimedAt: now + 1, touches: ['src/app.ts'] })],
      }),
    );
    const items = q.items.filter((i) => i.kind === 'overlap');
    expect(items.map((i) => [i.ticketId, i.ref])).toEqual([['2', '1+2']]);
    expect(items[0].title).toBe('Two agents may change the same files');
    expect(items[0].reasons.slice(0, 2)).toEqual(['agent-2 on #2, agent-1 on #1', 'both touch src/app.ts and src/**']);
  });

  it('suggests an integration ticket until one exists', () => {
    const overlap = {
      mapId: 'm1',
      files: ['a.ts'],
      at: now,
      tickets: [
        { ticketId: '1', ticketKey: '#1', agent: 'x', branch: 'b1' },
        { ticketId: '2', ticketKey: '#2', agent: 'y', branch: 'b2' },
      ] as [never, never],
    };
    const one = buildAttention(input({ integrations: [overlap] })).items.filter((i) => i.kind === 'integration');
    expect(one.map((i) => i.title)).toEqual(['Two branches changed the same files']);
    expect(one[0].reasons[0]).toBe('#1 and #2');
    const s = snap();
    s.tickets.push({ ...s.tickets[0], id: '3', key: '#3', title: 'Bring together #1 and #2', blockedBy: ['1', '2'] });
    expect(
      buildAttention(input({ snaps: [s], integrations: [overlap] })).items.some((i) => i.kind === 'integration'),
    ).toBe(false);
  });
});
