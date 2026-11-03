import type { IncomingMessage, ServerResponse } from 'node:http';
import { journalFile } from '../history/journalFile';
import type { ReplanProposal } from '../model/replan';
import { OperationError } from '../planning/operations/operationError';
import { approveReplan, rejectReplan } from '../planning/replan/decideReplan';
import { replanView, ReplanInvalid, type ReplanEnv } from '../planning/replan/replanFlow';
import { listAllReplans, listReplans, readReplan } from '../planning/replan/replanStore';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

const DECISIONS: Record<string, typeof approveReplan | undefined> = {
  '/replans/approve': approveReplan,
  '/replans/reject': rejectReplan,
};

const text = (v: unknown, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;

/**
 * `/replans` and `/assumptions` routes; false when none matches.
 * GET `/replans?map=` lists proposals (pending first, with their diff and frozen tickets; decided ones without),
 * GET `/replans/<id>?map=` reads one; POST `/replans/approve` and `/replans/reject` (`mapId`, `id`, `note`, `by`)
 * are the operator's calls, journaled and applied through the existing operations. GET `/assumptions?map=`.
 */
export async function handleReplans(ctx: RouteContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  const { pathname } = url;
  if (pathname === '/assumptions' && req.method === 'GET') {
    const snap = await (await ctx.active()).loadMap(requiredMap(url));
    sendJson(res, 200, { assumptions: snap.map.sections.assumptions ?? [] });
    return true;
  }
  if (!pathname.startsWith('/replans')) return false;
  if (req.method === 'GET') return (await getReplans(ctx, res, url), true);
  if (req.method !== 'POST') return false;
  const decide = DECISIONS[pathname];
  if (!decide) return false;
  const b = await readJson<{ mapId?: unknown; id?: unknown; note?: unknown; by?: unknown }>(req, '{}');
  if (!text(b.mapId) || !text(b.id)) throw new BadRequest('"mapId" and "id" are required');
  const env: ReplanEnv = { root: ctx.root, adapter: await ctx.active(), journal: journalFile(ctx.root) };
  const decision = {
    mapId: b.mapId as string,
    id: b.id as string,
    by: text(b.by) ? (b.by as string) : 'operator',
    note: typeof b.note === 'string' ? b.note.slice(0, 2000) : undefined,
  };
  try {
    sendJson(res, 200, { replan: await decide(env, decision) });
  } catch (e) {
    sendDecisionError(res, e);
  }
  return true;
}

async function getReplans(ctx: RouteContext, res: ServerResponse, url: URL) {
  const map = url.searchParams.get('map');
  const id = url.pathname.slice('/replans/'.length);
  if (id) {
    const p = readReplan(ctx.root, requiredMap(url), decodeURIComponent(id));
    if (!p) return sendJson(res, 404, { error: 'no such proposal' });
    return sendJson(res, 200, { replan: await withView(ctx, p) });
  }
  const all = map ? listReplans(ctx.root, map) : listAllReplans(ctx.root);
  const ordered = [
    ...all.filter((p) => p.status === 'pending'),
    ...all.filter((p) => p.status !== 'pending').reverse(),
  ];
  const replans = await Promise.all(ordered.map((p) => (p.status === 'pending' ? withView(ctx, p) : p)));
  sendJson(res, 200, { replans, pending: replans.filter((p) => p.status === 'pending').length });
}

/** A proposal with its dry-run diff and the tickets it freezes. */
async function withView(ctx: RouteContext, p: ReplanProposal) {
  const snap = await (await ctx.active()).loadMap(p.mapId);
  return { ...p, ...replanView(ctx.root, snap, p) };
}

function requiredMap(url: URL) {
  const map = url.searchParams.get('map');
  if (!text(map)) throw new BadRequest('"map" is required');
  return map!;
}

function sendDecisionError(res: ServerResponse, e: unknown) {
  if (e instanceof ReplanInvalid) return sendJson(res, 409, { error: e.message, errors: e.errors });
  if (e instanceof OperationError) return sendJson(res, 409, { error: e.message });
  throw e;
}
