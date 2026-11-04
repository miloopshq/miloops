import type { IntegrationOverlap, WorkspaceRecord, WorkspaceSide } from './workspace';

const sideOf = (w: WorkspaceRecord): WorkspaceSide => ({
  ticketId: w.ticketId,
  ticketKey: w.ticketKey,
  agent: w.agent,
  branch: w.branch,
});

/**
 * Pairs of claims in the same mission whose branches changed the same files. Pure and deterministic: workspaces
 * in ticket-id order, files sorted, so the same branches always give the same overlaps.
 */
export function findIntegrations(changes: { ws: WorkspaceRecord; files: string[] }[]): IntegrationOverlap[] {
  const sorted = [...changes].sort(
    (a, b) =>
      a.ws.mapId.localeCompare(b.ws.mapId) || a.ws.ticketId.localeCompare(b.ws.ticketId, undefined, { numeric: true }),
  );
  const out: IntegrationOverlap[] = [];
  sorted.forEach((a, i) => {
    for (const b of sorted.slice(i + 1)) {
      if (a.ws.mapId !== b.ws.mapId) continue;
      const theirs = new Set(b.files);
      const files = a.files.filter((f) => theirs.has(f)).sort();
      if (files.length) out.push({ mapId: a.ws.mapId, tickets: [sideOf(a.ws), sideOf(b.ws)], files });
    }
  });
  return out;
}
