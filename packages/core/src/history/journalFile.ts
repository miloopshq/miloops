import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Journal, TransitionEntry } from '../model/lifecycle';

/*
 * Mission history, one JSON line per transition, append-only:
 *   <tracker dir>/.events/<mapId>.jsonl
 *   <tracker dir>/.events/.gitignore      `*`: local history, never committed
 * Lines stay well under 4 KB, so concurrent appends from several processes never interleave.
 */
export const JOURNAL_DIR = '.events';

const MAX_REASON = 500;
const safe = (s: string) => s.replace(/[^\w.-]/g, '_');

export const journalPath = (root: string, mapId: string) => path.join(root, JOURNAL_DIR, `${safe(mapId)}.jsonl`);

export function journalFile(root: string): Journal & { read(mapId: string): TransitionEntry[] } {
  return {
    append(entry) {
      const dir = path.join(root, JOURNAL_DIR);
      mkdirSync(dir, { recursive: true });
      const ignore = path.join(dir, '.gitignore');
      if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
      const line = { ...entry, ...(entry.reason ? { reason: entry.reason.slice(0, MAX_REASON) } : {}) };
      appendFileSync(journalPath(root, entry.mapId), JSON.stringify(line) + '\n');
    },
    read(mapId) {
      let text = '';
      try {
        text = readFileSync(journalPath(root, mapId), 'utf8');
      } catch {
        return [];
      }
      const out: TransitionEntry[] = [];
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line) as TransitionEntry;
          if (e.v === 1) out.push(e);
        } catch {
          // a torn last line after a crash is skipped
        }
      }
      return out;
    },
  };
}
