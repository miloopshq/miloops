/**
 * Safe parallel work: an optional git worktree per claimed ticket, the files an agent says it will change, and
 * overlaps between agents' real changes. MILOOPS prepares workspaces only: it never runs agents, merges or pushes.
 * Files:
 *   <tracker dir>/workspaces.json                          WorkspaceSettings, the project's choice. Committed.
 *   <tracker dir>/.agents/workspaces/<map>--<ticket>.json  WorkspaceRecord, one per prepared worktree. Local.
 *   <tracker dir>/.agents/integration.json                 IntegrationScan, the latest overlap check. Local.
 * Worktrees go next to the repo: `<repo parent>/<repo>.miloops/<mission>-<n>`, on branch `miloops/<mission>/<n>`.
 */
export interface WorkspaceSettings {
  v: 1;
  /** Give each claimed ticket its own git worktree and branch. */
  worktrees: boolean;
  /** Where worktrees go, relative to the repo (default `../<repo>.miloops`). */
  dir?: string;
}

export const WORKSPACES_FILE = 'workspaces.json';

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = { v: 1, worktrees: false };

/** A prepared worktree: where the agent works, its branch, and the commit it started from. */
export interface Workspace {
  path: string;
  branch: string;
  base: string;
}

export interface WorkspaceRecord extends Workspace {
  v: 1;
  mapId: string;
  ticketId: string;
  ticketKey: string;
  agent: string;
  createdAt: number;
}

/** Two active claims whose branches changed the same files. */
export interface IntegrationOverlap {
  mapId: string;
  /** The two tickets, ordered by id so the pair is stable. */
  tickets: [WorkspaceSide, WorkspaceSide];
  files: string[];
  /** When the check first saw the current overlaps (the scan's time); set when the queue reads them. */
  at?: number;
}

export interface WorkspaceSide {
  ticketId: string;
  ticketKey: string;
  agent: string;
  branch: string;
}

export interface IntegrationScan {
  v: 1;
  at: number;
  overlaps: IntegrationOverlap[];
}
