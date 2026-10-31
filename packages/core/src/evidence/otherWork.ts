import type { MapSnapshot, Ticket } from '../model/types';
import { derivePhases } from '../planning/lifecycle/phase';
import { readAttempts } from '../verification/evidenceStore';
import { latestBaseline } from './baseline';
import { changesSince } from './changes';
import type { OtherWork } from './flags';
import { findWorktree, readTreeState } from './treeState';

/**
 * What the mission's other working and verifying tickets changed: a verifying
 * ticket's last attempt, or a working ticket's changes since its baseline,
 * read in its own worktree.
 */
export async function otherWork(root: string, snap: MapSnapshot, self: Ticket): Promise<OtherWork[]> {
  const phases = derivePhases(snap.tickets, snap.map.mode);
  const out: OtherWork[] = [];
  for (const t of snap.tickets) {
    const phase = phases.get(t.id);
    if (t.id === self.id || (phase !== 'working' && phase !== 'verifying')) continue;
    if (phase === 'verifying') {
      const git = readAttempts(root, snap.map.id, t.id).at(-1)?.git;
      if (git?.tree) out.push({ ticketKey: t.key, worktree: git.tree.toplevel, files: git.changed.map((c) => c.path) });
      continue;
    }
    const base = latestBaseline(root, snap.map.id, t.id)?.git;
    if (!base) continue;
    const wt = await findWorktree(base.toplevel, root);
    if ('error' in wt) continue;
    const changed = await changesSince(wt, await readTreeState(wt), base);
    out.push({ ticketKey: t.key, worktree: wt.toplevel, files: changed.map((c) => c.path) });
  }
  return out;
}
