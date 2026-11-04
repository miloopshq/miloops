import { zList, git } from '../evidence/git';
import type { WorkspaceRecord } from './workspace';

/** Files a ticket's branch changed since it forked: `git diff --name-only <base>...<branch>` in its worktree. */
export async function branchChanges(ws: WorkspaceRecord): Promise<string[] | undefined> {
  const r = await git(ws.path, ['diff', '--name-only', '-z', `${ws.base}...${ws.branch}`]);
  return r.code === 0 ? zList(r.stdout) : undefined;
}
