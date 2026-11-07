import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TrackerAdapter } from '../adapters/adapter';
import type { DecisionInput } from '../model/types';
import { DECISION_SOURCES } from '../planning/decisions/decisionRecord';
import { recordDecision, supersedeDecision } from '../planning/operations/decisionOps';
import { BadRequest, readJson, sendJson } from './http';

async function trailOf(adapter: TrackerAdapter, b: { trail?: unknown }) {
  const id = typeof b.trail === 'string' ? b.trail : '';
  if (!(await adapter.listMaps()).some((m) => m.id === id)) throw new BadRequest(`unknown trail "${id}"`);
  return id;
}

function checkInput(b: Partial<DecisionInput>, needQuestion: boolean) {
  const required: ('question' | 'answer' | 'decidedBy')[] = [
    ...(needQuestion ? (['question'] as const) : []),
    'answer',
    'decidedBy',
  ];
  for (const k of required) if (typeof b[k] !== 'string' || !b[k]!.trim()) throw new BadRequest(`"${k}" is required`);
  if (!b.source || !(b.source.kind in DECISION_SOURCES))
    throw new BadRequest(`"source.kind" must be one of ${Object.keys(DECISION_SOURCES).join(', ')}`);
}

/** `/decisions` routes on the given tracker; false when none matches. */
export async function handleDecisions(
  adapter: TrackerAdapter,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === '/decisions' && req.method === 'GET') {
    const only = url.searchParams.get('trail');
    const ids = only ? [only] : (await adapter.listMaps()).map((m) => m.id);
    const decisions = (await Promise.all(ids.map((id) => adapter.listDecisions(id))))
      .flat()
      .sort((a, b) => b.decidedAt - a.decidedAt);
    sendJson(res, 200, { decisions });
    return true;
  }
  if (url.pathname === '/decisions' && req.method === 'POST') {
    const b = await readJson<Partial<DecisionInput> & { trail?: string; appendToTrail?: boolean }>(req);
    const mapId = await trailOf(adapter, b);
    checkInput(b, true);
    const { trail: _m, appendToTrail, ...input } = b;
    sendJson(res, 201, await recordDecision(adapter, mapId, input as DecisionInput, { appendToTrail }));
    return true;
  }
  const sup = url.pathname.match(/^\/decisions\/([^/]+)\/supersede$/);
  if (sup && req.method === 'POST') {
    const b = await readJson<Partial<DecisionInput> & { trail?: string }>(req);
    const mapId = await trailOf(adapter, b);
    checkInput(b, false);
    const { trail: _m, ...input } = b;
    sendJson(res, 201, await supersedeDecision(adapter, mapId, decodeURIComponent(sup[1]), input as DecisionInput));
    return true;
  }
  return false;
}
