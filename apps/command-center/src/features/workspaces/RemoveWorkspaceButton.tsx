import { useState } from 'react';
import { Button } from '../../components/ui';
import type { RemoveOutcome } from './useWorkspaces';

/**
 * "Remove workspace": deletes a finished ticket's worktree folder; the branch stays. When the folder has uncommitted
 * changes, asks once more before discarding them.
 */
export function RemoveWorkspaceButton(props: { label?: string; onRemove: (force: boolean) => Promise<RemoveOutcome> }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const run = async (force: boolean) => {
    setBusy(true);
    setError(undefined);
    const r = await props.onRemove(force).catch((e: Error) => ({ error: e.message, dirty: false }));
    setBusy(false);
    setAsking(!!r.dirty && !force);
    if (!r.dirty) setError(r.error);
  };
  if (asking)
    return (
      <span className="ws-remove ask">
        <span className="vf-err">Uncommitted changes in this workspace will be lost.</span>
        <Button size="sm" disabled={busy} onClick={() => run(true)}>
          Remove anyway
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
          Keep
        </Button>
      </span>
    );
  return (
    <span className="ws-remove">
      <Button size="sm" disabled={busy} onClick={() => run(false)}>
        {props.label ?? 'Remove'}
      </Button>
      {error && <span className="vf-err">{error}</span>}
    </span>
  );
}
