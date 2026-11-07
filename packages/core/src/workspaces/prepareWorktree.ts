import { existsSync } from 'node:fs';
import path from 'node:path';
import { git, gitText } from '../evidence/git';
import type { Workspace, WorkspaceSettings } from './workspace';
import { readWorkspace, writeWorkspace } from './workspaceStore';

export interface PrepareInput {
  /** Tracker folder: where the workspace record is kept. */
  root: string;
  /** The repo the worktree branches from. */
  repoRoot: string;
  settings: WorkspaceSettings;
  mapId: string;
  ticket: { id: string; key: string };
  agent: string;
  now?: number;
}

export type Prepared = { workspace: Workspace } | { note: string };

const slugOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'trail';

/** The branch and folder a ticket's worktree uses: `teamtrail/<trail>/<n>` in `<repo>.teamtrail/<trail>-<n>`. */
export function worktreeLocation(top: string, settings: WorkspaceSettings, mapId: string, key: string) {
  const slug = slugOf(mapId);
  const n = key.replace(/^#/, '');
  const dir = path.resolve(top, settings.dir ?? `../${path.basename(top)}.teamtrail`);
  return { branch: `teamtrail/${slug}/${n}`, path: path.join(dir, `${slug}-${n}`) };
}

/**
 * A git worktree and branch for one claimed ticket, created from HEAD next to the repo. Claiming again reuses it.
 * Never merges, pushes or deletes anything. When there's no repo (or no commit, or git fails), says why instead.
 */
export async function prepareWorktree(i: PrepareInput): Promise<Prepared> {
  const known = readWorkspace(i.root, i.mapId, i.ticket.id);
  if (known && existsSync(known.path)) return { workspace: pick(known) };
  const top = await gitText(i.repoRoot, ['rev-parse', '--show-toplevel']);
  if (!top) return { note: 'No workspace: this folder is not a git repository (or git is missing). Work in the repo.' };
  const head = await gitText(top, ['rev-parse', 'HEAD']);
  if (!head) return { note: 'No workspace: the repository has no commits yet. Work in the repo.' };
  const where = worktreeLocation(top, i.settings, i.mapId, i.ticket.key);
  const made = await addWorktree(top, where, head);
  if ('note' in made) return made;
  writeWorkspace(i.root, {
    v: 1,
    mapId: i.mapId,
    ticketId: i.ticket.id,
    ticketKey: i.ticket.key,
    agent: i.agent,
    createdAt: i.now ?? Date.now(),
    ...made.workspace,
  });
  return made;
}

/** Adds the worktree, reusing the branch (and a folder already on it) when they exist from an earlier claim. */
async function addWorktree(top: string, where: { branch: string; path: string }, head: string): Promise<Prepared> {
  if (existsSync(where.path)) {
    const onBranch = await gitText(where.path, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (onBranch === where.branch) return { workspace: { ...where, base: await baseOf(where.path, head) } };
    return { note: `No workspace: ${where.path} already exists and isn't on ${where.branch}. Work in the repo.` };
  }
  const branchExists = (await git(top, ['rev-parse', '--verify', '--quiet', `refs/heads/${where.branch}`])).code === 0;
  const args = branchExists
    ? ['worktree', 'add', where.path, where.branch]
    : ['worktree', 'add', '-b', where.branch, where.path, head];
  const r = await git(top, args);
  if (r.code !== 0) {
    const why = r.stderr.trim().split('\n')[0] || 'git worktree add failed';
    return { note: `No workspace: ${why}. Work in the repo.` };
  }
  const base = branchExists ? await baseOf(where.path, head) : head;
  return { workspace: { ...where, base } };
}

/** Where a reused branch forked from the repo's HEAD. */
async function baseOf(cwd: string, head: string) {
  return (await gitText(cwd, ['merge-base', head, 'HEAD'])) ?? head;
}

const pick = (w: Workspace): Workspace => ({ path: w.path, branch: w.branch, base: w.base });
