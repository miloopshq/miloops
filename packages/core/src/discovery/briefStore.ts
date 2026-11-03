import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BRIEF_DIR, type DiscoveryBrief } from './brief';
import { parseBrief, serializeBrief } from './briefFile';

const safe = (s: string) => s.replace(/[^\w.-]/g, '_');

/** `<tracker dir>/briefs/<mapId>.md`: committed with the repo, the same for every tracker. */
export const briefPath = (root: string, mapId: string) => path.join(root, BRIEF_DIR, `${safe(mapId)}.md`);

export function readBrief(root: string, mapId: string): DiscoveryBrief | undefined {
  const file = briefPath(root, mapId);
  if (!existsSync(file)) return undefined;
  try {
    return parseBrief(mapId, readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

export function writeBrief(root: string, brief: DiscoveryBrief) {
  mkdirSync(path.join(root, BRIEF_DIR), { recursive: true });
  writeFileSync(briefPath(root, brief.mapId), serializeBrief(brief));
}
