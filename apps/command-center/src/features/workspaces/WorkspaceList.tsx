import { MetaLine, Row } from '../../components/ui';
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
        <Row
          key={`${w.mapId}/${w.ticketId}`}
          as="li"
          className={`ws-row ${w.active ? 'active' : 'finished'}`}
          title={<span className="t-code">{w.branch}</span>}
          titleText={w.branch}
          context={
            <MetaLine parts={[{ text: w.ticketKey, code: true }, w.active ? `Active · ${w.agent}` : 'Finished']} />
          }
          detail={<span className="t-code">{w.path}</span>}
          detailText={w.path}
          below={
            w.active ? undefined : (
              <RemoveWorkspaceButton onRemove={(force) => props.onRemove(w.mapId, w.ticketId, force)} />
            )
          }
        />
      ))}
    </ul>
  );
}
