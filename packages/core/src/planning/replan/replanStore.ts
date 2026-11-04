import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '../../lib/jsonFile';
import type { ReplanProposal } from '../../model/replan';

/*
 * Replan proposals, local history (gitignored):
 *   <tracker dir>/.replans/<mapId>/R-<n>.json
 * Ids are taken with an exclusive create, so two agents proposing at once never share one.
 */
export const REPLANS_DIR = '.replans';

const safe = (s: string) => s.replace(/[^\w.-]/g, '_');
const mapDir = (root: string, mapId: string) => path.join(root, REPLANS_DIR, safe(mapId));
const fileOf = (root: string, mapId: string, id: string) => path.join(mapDir(root, mapId), `${safe(id)}.json`);
const idNumber = (id: string) => Number(id.match(/^R-(\d+)$/)?.[1] ?? 0);

/** A mission's proposals, oldest first. */
export function listReplans(root: string, mapId: string): ReplanProposal[] {
  let names: string[] = [];
  try {
    names = readdirSync(mapDir(root, mapId)).filter((n) => /^R-\d+\.json$/.test(n));
  } catch {
    return [];
  }
  return names
    .map((n) => readJsonFile<ReplanProposal>(path.join(mapDir(root, mapId), n)))
    .filter((p): p is ReplanProposal => !!p && p.v === 1)
    .sort((a, b) => idNumber(a.id) - idNumber(b.id));
}

/** Every mission's proposals. */
export function listAllReplans(root: string): ReplanProposal[] {
  let maps: string[] = [];
  try {
    maps = readdirSync(path.join(root, REPLANS_DIR)).filter((n) => !n.startsWith('.'));
  } catch {
    return [];
  }
  return maps.flatMap((m) => listReplans(root, m));
}

export const readReplan = (root: string, mapId: string, id: string) =>
  readJsonFile<ReplanProposal>(fileOf(root, mapId, id));

/** Stores a new proposal under the next free id and returns it with that id. */
export function createReplan(root: string, draft: Omit<ReplanProposal, 'id'>): ReplanProposal {
  const dir = mapDir(root, draft.mapId);
  mkdirSync(dir, { recursive: true });
  ensureIgnored(root);
  let n = Math.max(0, ...listReplans(root, draft.mapId).map((p) => idNumber(p.id))) + 1;
  for (;;) {
    const p: ReplanProposal = { ...draft, id: `R-${n}` };
    try {
      writeFileSync(fileOf(root, draft.mapId, p.id), JSON.stringify(p, null, 2), { flag: 'wx' });
      return p;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      n++;
    }
  }
}

export function writeReplan(root: string, p: ReplanProposal) {
  writeJsonAtomic(fileOf(root, p.mapId, p.id), p);
}

function ensureIgnored(root: string) {
  const ignore = path.join(root, REPLANS_DIR, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
}
