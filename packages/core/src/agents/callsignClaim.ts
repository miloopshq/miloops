import fs from 'node:fs';
import path from 'node:path';
import { processAlive } from '../lib/processAlive';
import { AGENTS_DIR } from './agentLink';

export const CALLSIGNS_DIR = 'callsigns';

const name = (family: string, n: number) => `${family}-${String(n).padStart(2, '0')}`;

/**
 * Reserves the first free `<family>-NN` callsign for this process, atomically across processes: each callsign is
 * a lock file created with O_EXCL, so two agents connecting in the same instant can never get the same one. A lock
 * whose process is gone is taken over. `taken` adds names in use elsewhere (e.g. running session docs). The lock is
 * removed when this process exits.
 */
export function claimCallsign(root: string, family: string, taken: Set<string> = new Set()): string {
  const dir = path.join(root, AGENTS_DIR, CALLSIGNS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  for (let n = 1; ; n++) {
    const callsign = name(family, n);
    if (taken.has(callsign)) continue;
    const file = path.join(dir, `${callsign}.json`);
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
      if (owner === process.pid) return callsign;
      if (processAlive(owner)) continue;
      // Stale: its process is gone. Remove and retry this number; another agent may win the retry, which is fine.
      fs.rmSync(file, { force: true });
      n--;
      continue;
    }
    process.once('exit', () => fs.rmSync(file, { force: true }));
    return callsign;
  }
}
