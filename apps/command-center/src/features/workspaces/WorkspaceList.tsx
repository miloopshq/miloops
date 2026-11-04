import { RemoveWorkspaceButton } from './RemoveWorkspaceButton';
import type { RemoveOutcome, WorkspaceRow } from './useWorkspaces';

/** Settings → Workspaces: every prepared worktree, active or finished; finished ones can be removed. */
export function WorkspaceList(props: {
  rows: WorkspaceRow[];
  onRemove: (mapId: string, ticketId: string, force: boolean) => Promise<RemoveOutcome>;
}) {
  if (!props.rows.length) return null;
  return (
    <ul className="ws-list">
      {props.rows.map((w) => (
        <li key={`${w.mapId}/${w.ticketId}`} className={`ws-row ${w.active ? 'active' : 'finished'}`}>
          <span className="ws-ticket">{w.ticketKey}</span>
          <code className="ws-branch">{w.branch}</code>
          <span className="ws-status mono-label">{w.active ? `Active · ${w.agent}` : 'Finished'}</span>
          <code className="ws-path" title={w.path}>
            {w.path}
          </code>
          {!w.active && <RemoveWorkspaceButton onRemove={(force) => props.onRemove(w.mapId, w.ticketId, force)} />}
        </li>
      ))}
    </ul>
  );
}
