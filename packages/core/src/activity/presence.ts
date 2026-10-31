import type { SessionUsage } from '../model/types';

/** Minimal synchronous key-value storage: `localStorage` in the browser, a JSON file in a CLI, a Map in tests and demo. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
}

function readJson<T>(store: KeyValueStore, key: string, fallback: T): T {
  try {
    const raw = store.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * When the operator was last present, per mission. "Present" is decided by the
 * front end (tab visible and recently used); this only stores the times.
 */
export class Presence {
  private seen: Record<string, number>;
  constructor(
    private store: KeyValueStore,
    private key = 'presence',
  ) {
    this.seen = readJson(store, key, {});
  }

  /** Copy of every mission's last-seen time. */
  snapshot(): Record<string, number> {
    return { ...this.seen };
  }

  lastSeen(mapId: string): number | undefined {
    return this.seen[mapId];
  }

  /** Latest time the operator was present in any mission; undefined on first run. */
  lastSeenAny(): number | undefined {
    const ts = Object.values(this.seen);
    return ts.length ? Math.max(...ts) : undefined;
  }

  markSeen(mapIds: string[], at = Date.now()) {
    let changed = false;
    for (const id of mapIds) {
      if ((this.seen[id] ?? 0) >= at) continue;
      this.seen[id] = at;
      changed = true;
    }
    if (changed) this.store.set(this.key, JSON.stringify(this.seen));
  }
}

interface Bucket {
  /** Bucket start, ms. */
  at: number;
  i: number;
  o: number;
  c: number;
  /** Session ids that reported usage in this bucket. */
  s: string[];
}

const BUCKET_MS = 5 * 60_000;
const KEEP_MS = 14 * 86_400_000;

/**
 * Model usage over time per mission, in 5-minute buckets, persisted so "spend
 * since you were last here" survives a reload. Fed by `ActivityStream` from
 * agent usage reports.
 */
export class UsageLedger {
  private buckets: Record<string, Bucket[]>;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Last cumulative total per session for `addTotal`, persisted so a reload does not count the same usage twice. */
  private totals: Record<string, SessionUsage & { at: number }>;
  constructor(
    private store: KeyValueStore,
    private key = 'usage',
  ) {
    this.buckets = readJson(store, key, {});
    this.totals = readJson(store, `${key}.totals`, {});
  }

  /** Record a session's cumulative usage (as reported by another process); only the growth since its last total is added. */
  addTotal(mapId: string, sessionId: string, total: SessionUsage, at = Date.now()) {
    const prev = this.totals[sessionId];
    const delta = {
      inputTokens: total.inputTokens - (prev?.inputTokens ?? 0),
      outputTokens: total.outputTokens - (prev?.outputTokens ?? 0),
      costUsd: total.costUsd - (prev?.costUsd ?? 0),
    };
    this.totals[sessionId] = { ...total, at };
    if (delta.inputTokens > 0 || delta.outputTokens > 0 || delta.costUsd > 0) this.add(mapId, delta, sessionId, at);
    else this.save();
  }

  add(mapId: string, delta: SessionUsage, sessionId: string, at = Date.now()) {
    if (!mapId) return;
    const start = Math.floor(at / BUCKET_MS) * BUCKET_MS;
    const list = (this.buckets[mapId] ??= []);
    let b = list.find((x) => x.at === start);
    if (!b) {
      b = { at: start, i: 0, o: 0, c: 0, s: [] };
      list.push(b);
      list.sort((x, y) => x.at - y.at);
    }
    b.i += delta.inputTokens;
    b.o += delta.outputTokens;
    b.c += delta.costUsd;
    if (!b.s.includes(sessionId)) b.s.push(sessionId);
    this.save();
  }

  /** Usage reported at or after `since`, and how many sessions reported it. */
  since(mapId: string, since: number): SessionUsage & { sessions: number } {
    const out = { inputTokens: 0, outputTokens: 0, costUsd: 0, sessions: 0 };
    const ids = new Set<string>();
    for (const b of this.buckets[mapId] ?? []) {
      if (b.at + BUCKET_MS <= since) continue;
      out.inputTokens += b.i;
      out.outputTokens += b.o;
      out.costUsd += b.c;
      b.s.forEach((s) => ids.add(s));
    }
    out.sessions = ids.size;
    return out;
  }

  private save() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.dirty) return;
      this.dirty = false;
      const cutoff = Date.now() - KEEP_MS;
      for (const k of Object.keys(this.buckets)) this.buckets[k] = this.buckets[k].filter((b) => b.at >= cutoff);
      for (const [k, v] of Object.entries(this.totals)) if (v.at < cutoff) delete this.totals[k];
      this.store.set(this.key, JSON.stringify(this.buckets));
      this.store.set(`${this.key}.totals`, JSON.stringify(this.totals));
    }, 2000);
  }
}
