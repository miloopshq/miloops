import { BRAND, type IntegrationScan, type WorkspaceRecord, type WorkspaceSettings } from '@miloops-hq/core';
import { useCallback, useEffect, useState } from 'react';
import { onTrackerChange } from '../../lib/trackerChanges';

export interface WorkspacesView {
  settings: WorkspaceSettings;
  errors: string[];
  exists: boolean;
  workspaces: WorkspaceRecord[];
  integration: IntegrationScan;
}

const url = `${BRAND.apiPrefix}/workspaces`;

async function fetchView(): Promise<WorkspacesView | null> {
  const r = await fetch(url);
  if (!r.ok) return null;
  return (await r.json()) as WorkspacesView;
}

/**
 * The project's worktree setting and the prepared worktrees, kept fresh when `workspaces.json` changes.
 * undefined while loading, null without a server (static build). `save` resolves to an error message, if any.
 */
export function useWorkspaces() {
  const [view, setView] = useState<WorkspacesView | null>();
  const load = useCallback(() => {
    fetchView().then(setView, () => setView(null));
  }, []);
  useEffect(() => {
    load();
    return onTrackerChange((p) => {
      if (p.endsWith('workspaces.json')) load();
    });
  }, [load]);
  const save = useCallback(async (settings: WorkspaceSettings): Promise<string | undefined> => {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const body = (await r.json()) as WorkspacesView & { error?: string };
    if (!r.ok) return body.error ?? `Saving failed (${r.status})`;
    setView(body);
    return undefined;
  }, []);
  return { view, save };
}
