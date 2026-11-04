import { RemoveWorkspaceButton } from './RemoveWorkspaceButton';
import { useWorkspaces } from './useWorkspaces';

/** In the inspector: a finished ticket that still has its worktree, with "Remove workspace" (the branch stays). */
export function TicketWorkspace(props: { mapId: string; ticketId: string }) {
  const { view, remove } = useWorkspaces();
  const ws = view?.workspaces.find((w) => w.mapId === props.mapId && w.ticketId === props.ticketId);
  if (!ws || ws.active) return null;
  return (
    <section className="ticket-workspace">
      <span className="mono-label">Workspace</span>
      <p>
        <code>{ws.branch}</code> in <code title={ws.path}>{ws.path}</code>
      </p>
      <RemoveWorkspaceButton
        label="Remove workspace"
        onRemove={(force) => remove(props.mapId, props.ticketId, force)}
      />
    </section>
  );
}
