import { BRAND } from '@miloops-hq/core';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { SettingsSection } from './SettingsSection';
import { useWorkspaces } from './useWorkspaces';

/** Parallel work: a separate git worktree and branch for each claimed ticket. MILOOPS never merges or pushes. */
export function WorkspacesSection() {
  const { view, save } = useWorkspaces();
  const [error, setError] = useState<string>();
  if (!view) return null;
  const on = view.settings.worktrees;
  const toggle = () => {
    setError(undefined);
    save({ ...view.settings, worktrees: !on }).then(setError, (e: Error) => setError(e.message));
  };
  return (
    <SettingsSection title="Workspaces">
      <p className="vf-intro">
        Give each agent its own copy of the repo for every ticket it claims, on its own branch, so agents working at the
        same time don't step on each other. You review and merge the branches; {BRAND.name} never merges or pushes.
      </p>
      <div className="att-settings-row">
        <span>A worktree per ticket</span>
        <Button size="sm" on={on} aria-pressed={on} className="worktrees-toggle" onClick={toggle}>
          {on ? 'On' : 'Off'}
        </Button>
      </div>
      <span className="mono-label">
        {BRAND.dataDir}/workspaces.json · {view.workspaces.length} active
        {view.workspaces.length === 1 ? ' worktree' : ' worktrees'}
      </span>
      {view.errors.length > 0 && (
        <ul className="vf-errors">
          {view.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {error && <span className="vf-err">{error}</span>}
    </SettingsSection>
  );
}
