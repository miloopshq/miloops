import type { IncomingMessage, ServerResponse } from 'node:http';
import { journalFile } from '../history/journalFile';
import { TICKET_PHASES, type TransitionEntry } from '../model/lifecycle';
import { TRANSITIONS } from '../planning/lifecycle/transitions';
import { BadRequest, readJson, sendJson } from './http';

const EVENTS = new Set<string>(TRANSITIONS.map((r) => r.event));
const PHASES = new Set<string>(TICKET_PHASES);
const ACTORS = new Set(['agent', 'trail lead', 'engine']);
const text = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length < 300;

function valid(e: Partial<TransitionEntry>): e is TransitionEntry {
  return (
    e.v === 1 &&
    e.kind === 'transition' &&
    typeof e.at === 'number' &&
    text(e.mapId) &&
    text(e.ticketId) &&
    text(e.ticketKey) &&
    text(e.actor) &&
    EVENTS.has(e.event ?? '') &&
    PHASES.has(e.from ?? '') &&
    PHASES.has(e.to ?? '') &&
    ACTORS.has(e.actorKind ?? '') &&
    (e.reason === undefined || typeof e.reason === 'string') &&
    (e.sessionId === undefined || text(e.sessionId))
  );
}

/** `/journal`: a trail's transition history (GET `?mapId=`), and appends from the browser (POST). */
export async function handleJournal(root: string, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname !== '/journal') return false;
  const journal = journalFile(root);
  if (req.method === 'GET') {
    const mapId = url.searchParams.get('mapId');
    if (!mapId) throw new BadRequest('"mapId" is required');
    sendJson(res, 200, { entries: journal.read(mapId) });
    return true;
  }
  if (req.method === 'POST') {
    const e = await readJson<Partial<TransitionEntry>>(req, '{}');
    if (!valid(e)) throw new BadRequest('not a transition entry');
    journal.append(e);
    sendJson(res, 200, { ok: true });
    return true;
  }
  return false;
}
