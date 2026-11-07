import fs from 'node:fs';
import path from 'node:path';
import { processAlive } from '../lib/processAlive';
import { AGENTS_DIR } from './agentLink';

export const TRAIL_NAMES_DIR = 'trailNames';

const name = (family: string, n: number) => `${family}-${String(n).padStart(2, '0')}`;

/**
 * Reserves the first free `<family>-NN` trail name for this process, atomically across processes: each trail name is
 * a lock file created with O_EXCL, so two agents connecting in the same instant can never get the same one. A lock
 * whose process is gone is taken over. `taken` adds names in use elsewhere (e.g. running session docs). The lock is
 * removed when this process exits.
 */
export function claimTrailName(root: string, family: string, taken: Set<string> = new Set()): string {
  const dir = path.join(root, AGENTS_DIR, TRAIL_NAMES_DIR);
  fs.mkdirSync(dir, { recursive: true });
  for (let n = 1; ; n++) {
    const trailName = name(family, n);
    if (taken.has(trailName)) continue;
    const file = path.join(dir, `${trailName}.json`);
    try {
      fs.writeFileSync(file, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: 'wx' });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      let owner = 0;
      try {
        owner = (JSON.parse(fs.readFileSync(file, 'utf8')) as { pid?: number }).pid ?? 0;
      } catch {
        // half-written by its owner a moment ago: treat as held
        continue;
      }
      if (owner === process.pid) return trailName;
      if (processAlive(owner)) continue;
      // Stale: its process is gone. Remove and retry this number; another agent may win the retry, which is fine.
      fs.rmSync(file, { force: true });
      n--;
      continue;
    }
    process.once('exit', () => fs.rmSync(file, { force: true }));
    return trailName;
  }
}
