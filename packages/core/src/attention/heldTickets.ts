import type { MapSnapshot } from '../model/types';

/**
 * Open tickets that can't move until `holds` are handled: the held tickets themselves plus everything
 * downstream of them, each counted once (a diamond counts its bottom once). `own` is left out, so a
 * question about a ticket doesn't count that ticket as one it blocks.
 */
export function heldTickets(snap: MapSnapshot | undefined, holds: string[], own?: string): string[] {
  if (!snap) return [];
  const open = new Set(snap.tickets.filter((t) => t.state === 'open').map((t) => t.id));
  const dependents = new Map<string, string[]>();
  for (const t of snap.tickets) for (const b of t.blockedBy) dependents.set(b, [...(dependents.get(b) ?? []), t.id]);
  const seen = new Set<string>();
  const queue = holds.filter((id) => open.has(id));
  while (queue.length) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of dependents.get(id) ?? []) if (open.has(next)) queue.push(next);
  }
  if (own) seen.delete(own);
  return [...seen].sort();
}
