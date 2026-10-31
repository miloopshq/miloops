import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RemoteKind } from './types';
import type { OutboxStore, QueuedWrite } from './synced';

/*
 * Queued tracker writes on disk, so they survive an exit or crash:
 *   <tracker dir>/.outbox/<kind>-<target>.<pid>-<n>.json    one file per live adapter, `{ v: 1, writes }`
 *   <tracker dir>/.outbox/.gitignore                          `*`: local state, never committed
 * A file whose process is gone (or whose adapter was disposed) is adopted by
 * the next adapter for the same tracker and target: it is claimed with an
 * atomic rename, so two processes starting together never both replay it.
 */
export const OUTBOX_DIR = '.outbox';

export const isOutboxPath = (rel: string) => rel === OUTBOX_DIR || rel.startsWith(`${OUTBOX_DIR}/`) || rel.startsWith(`${OUTBOX_DIR}\\`);

/** `github-owner_name`, `linear-<team>[-<project>]`: a queue only replays into the tracker it was written for. */
export function outboxKey(kind: RemoteKind, ...target: (string | undefined)[]) {
  return [kind, ...target.filter(Boolean)]
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
}

/** Adapters of this process that own their file. */
const live = new Set<string>();
let instances = 0;

const OWNER = /^(\d+)-(\d+)(?:\.claim-\d+)?$/;

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function owned(owner: string) {
  const m = owner.match(OWNER);
  if (!m) return false;
  return Number(m[1]) === process.pid ? live.has(`${m[1]}-${m[2]}`) : alive(Number(m[1]));
}

/** Queue files for `key` that no live adapter owns. */
function orphans(dir: string, key: string) {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => n.startsWith(`${key}.`) && n.endsWith('.json') && !owned(n.slice(key.length + 1, -'.json'.length))).sort();
}

function readWrites(file: string): QueuedWrite[] {
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8')) as {
      v?: number;
      writes?: QueuedWrite[];
    };
    return doc.v === 1 && Array.isArray(doc.writes) ? doc.writes.filter((w) => w && typeof w.id === 'string' && typeof w.mapId === 'string' && w.change) : [];
  } catch {
    return [];
  }
}

/** Unsent writes left for `key` by earlier runs (shown before an adapter adopts them). */
export function orphanedWrites(root: string, key: string) {
  const dir = path.join(root, OUTBOX_DIR);
  return orphans(dir, key).reduce((n, f) => n + readWrites(path.join(dir, f)).length, 0);
}

export function outboxFile(root: string, key: string): OutboxStore & { file: string } {
  const dir = path.join(root, OUTBOX_DIR);
  const owner = `${process.pid}-${++instances}`;
  const file = path.join(dir, `${key}.${owner}.json`);
  let released = false;

  const save = (writes: QueuedWrite[]) => {
    if (released) return;
    if (!writes.length) return void rmSync(file, { force: true });
    mkdirSync(dir, { recursive: true });
    const ignore = path.join(dir, '.gitignore');
    if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ v: 1, writes }, null, 2) + '\n');
    renameSync(tmp, file);
  };

  return {
    file,
    load() {
      live.add(owner);
      const claimed: string[] = [];
      for (const [i, name] of orphans(dir, key).entries()) {
        const to = path.join(dir, `${key}.${owner}.claim-${i}.json`);
        try {
          renameSync(path.join(dir, name), to);
          claimed.push(to);
        } catch {
          // another process claimed it first
        }
      }
      const seen = new Set<string>();
      const writes = claimed
        .flatMap(readWrites)
        .filter((w) => !seen.has(w.id) && seen.add(w.id))
        .sort((a, b) => a.at - b.at);
      save(writes);
      for (const f of claimed) rmSync(f, { force: true });
      return writes;
    },
    save,
    release() {
      released = true;
      live.delete(owner);
    },
  };
}
