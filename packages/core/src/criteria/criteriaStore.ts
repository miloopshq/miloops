import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CRITERIA_DIR, type Criterion, type TicketCriteria } from './criteria';
import { parseCriteria, serializeCriteria } from './criteriaFile';

const safe = (s: string) => s.replace(/[^\w.-]/g, '_');
const file = (root: string, mapId: string) => path.join(root, CRITERIA_DIR, `${safe(mapId)}.md`);

/** Every ticket's criteria on a trail. */
export function readCriteria(root: string, mapId: string): TicketCriteria[] {
  const f = file(root, mapId);
  if (!existsSync(f)) return [];
  try {
    return parseCriteria(readFileSync(f, 'utf8'));
  } catch {
    return [];
  }
}

export const criteriaOf = (root: string, mapId: string, ticketId: string): Criterion[] =>
  readCriteria(root, mapId).find((t) => t.ticketId === ticketId)?.criteria ?? [];

/** Replaces one ticket's criteria (unconfirming them), or sets their confirmation. */
export function writeTicketCriteria(
  root: string,
  map: { id: string; title: string },
  ticket: { id: string; key: string },
  patch: { criteria: Criterion[] } | { confirmed: boolean },
) {
  const all = readCriteria(root, map.id).filter((t) => t.ticketId !== ticket.id);
  const prev = readCriteria(root, map.id).find((t) => t.ticketId === ticket.id);
  const next: TicketCriteria =
    'criteria' in patch
      ? { ticketId: ticket.id, ticketKey: ticket.key, criteria: patch.criteria }
      : {
          ticketId: ticket.id,
          ticketKey: ticket.key,
          criteria: prev?.criteria ?? [],
          confirmed: patch.confirmed || undefined,
        };
  mkdirSync(path.join(root, CRITERIA_DIR), { recursive: true });
  writeFileSync(file(root, map.id), serializeCriteria(map.title, [...all, next]));
  return next;
}
