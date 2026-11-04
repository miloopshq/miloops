import { readLeases } from '../agents/leaseStore';
import { findIntegrations } from './findIntegrations';
import { branchChanges } from './integration';
import { readIntegrationScan, writeIntegrationScan } from './integrationStore';
import type { IntegrationScan } from './workspace';
import { listWorkspaces } from './workspaceStore';

/**
 * Compares the real changes of every active claim that has a worktree, and keeps the result in
 * `.agents/integration.json` (rewritten only when the overlaps change). Returns the current scan.
 */
export async function scanIntegrations(root: string, now = Date.now()): Promise<IntegrationScan> {
  const held = new Set(
    readLeases(root)
      .filter((l) => !l.returned)
      .map((l) => `${l.mapId}/${l.ticketId}`),
  );
  const active = listWorkspaces(root).filter((w) => held.has(`${w.mapId}/${w.ticketId}`));
  const changes = await Promise.all(active.map(async (ws) => ({ ws, files: (await branchChanges(ws)) ?? [] })));
  const overlaps = findIntegrations(changes);
  const last = readIntegrationScan(root);
  if (JSON.stringify(last.overlaps) === JSON.stringify(overlaps)) return last;
  const next: IntegrationScan = { v: 1, at: now, overlaps };
  writeIntegrationScan(root, next);
  return next;
}
