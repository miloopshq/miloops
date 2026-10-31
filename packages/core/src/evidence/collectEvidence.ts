import { existsSync } from 'node:fs';
import type { GitEvidence } from '../model/evidence';
import type { MapSnapshot, Ticket } from '../model/types';
import type { VerificationConfig } from '../model/verification';
import { DEFAULT_CONFIG } from '../verification/config';
import { latestBaseline } from './baseline';
import { changesSince, statsOf } from './changes';
import { evidenceFlags } from './flags';
import { git } from './git';
import { otherWork } from './otherWork';
import { findWorktree, readTreeState } from './treeState';

export interface EvidenceRequest {
  /** Tracker folder. */
  root: string;
  /** Where the agent works, used when the claim left no baseline. */
  cwd: string;
  snap: MapSnapshot;
  ticket: Ticket;
  config?: VerificationConfig;
  /** `configHash` of verification.json now; absent when there is no file. */
  configHash?: string;
  noCodeReason?: string;
}

/**
 * The git evidence of a completion: the worktree now, the files changed since
 * the claim's baseline, and the flags a human should see. Read in the
 * baseline's worktree, so it does not matter where the completing process runs.
 */
export async function collectEvidence(r: EvidenceRequest): Promise<GitEvidence> {
  const base = latestBaseline(r.root, r.snap.map.id, r.ticket.id);
  const dir = base?.git && existsSync(base.git.toplevel) ? base.git.toplevel : r.cwd;
  const wt = await findWorktree(dir, r.root);
  const now = 'error' in wt ? undefined : await readTreeState(wt);
  const changed = now && base?.git && !('error' in wt) ? await changesSince(wt, now, base.git) : [];
  const b = base?.git;
  const descends =
    now && b?.head && now.head && b.head !== now.head
      ? (await git(now.toplevel, ['merge-base', '--is-ancestor', b.head, now.head])).code === 0
      : now && b
        ? true
        : undefined;
  const flags = evidenceFlags({
    base,
    now,
    ...('error' in wt ? { noGit: wt.error } : {}),
    changed,
    ticketType: r.ticket.type,
    noChanges: (r.config ?? DEFAULT_CONFIG).noChanges,
    noCodeReason: r.noCodeReason,
    configHash: r.configHash,
    descends,
    others: now ? await otherWork(r.root, r.snap, r.ticket) : [],
  });
  return {
    v: 1,
    ...(base ? { baseline: base.id } : {}),
    ...(b ? { base: { head: b.head, branch: b.branch } } : {}),
    ...(now
      ? { tree: { toplevel: now.toplevel, head: now.head, branch: now.branch, fingerprint: now.fingerprint } }
      : {}),
    changed,
    stats: statsOf(changed),
    ...(r.configHash ? { configHash: r.configHash } : {}),
    flags,
  };
}
