import type { TrackerAdapter } from '../adapters/adapter';
import { TrackerError } from '../adapters/remote/http';
import type { TicketPhase } from '../model/lifecycle';
import type { CiProvider, PrCandidate, PrLink, PrLinkSource, TicketSync } from '../model/prEvidence';
import type { Ticket } from '../model/types';
import { derivePhases } from '../planning/lifecycle/phase';
import { readAttempts } from '../verification/evidenceStore';
import { redact } from '../verification/redact';
import { ticketRefs } from './attemptRefs';
import { summarizeChecks } from './github/checkState';
import { ticketRef } from './github/prText';
import { mismatchFlags } from './mismatchFlags';
import { appendFlagEntry, readTicketSync, writeTicketSync } from './syncStore';

export interface ReconcileEnv {
  /** Tracker folder: `.evidence/` and `.events/` live here. */
  root: string;
  /** Read only: the reconciler lists and loads missions, nothing else. */
  adapter: TrackerAdapter;
  provider: CiProvider;
  requiredChecks: string[];
  now?: () => number;
}

export interface ReconcileResult {
  /** Tickets whose snapshot, flags or error changed. */
  changed: TicketSync[];
  /** `<ticket key>: <reason>` per ticket that could not be read, secrets redacted. */
  failures: string[];
}

const RANK: Record<PrLinkSource, number> = { explicit: 4, attempt: 3, branch: 2, marker: 1 };

function strongest(links: (PrLink | undefined)[]): PrLink | undefined {
  let best: PrLink | undefined;
  for (const l of links) if (l && (!best || RANK[l.source] > RANK[best.source])) best = l;
  return best;
}

const comparable = (s: TicketSync) => JSON.stringify([s.link, s.pr, s.checks, s.flags, s.error]);

async function reconcileTicket(
  env: ReconcileEnv,
  mapId: string,
  t: Ticket,
  phase: TicketPhase,
  byRef: Map<string, PrCandidate>,
  now: number,
): Promise<TicketSync | undefined> {
  const prev = readTicketSync(env.root, mapId, t.id);
  const refs = ticketRefs(readAttempts(env.root, mapId, t.id));
  const marked = byRef.get(ticketRef(mapId, t.id));
  let link = strongest([
    refs.pr ? { number: refs.pr, source: 'attempt', at: now } : undefined,
    prev?.link,
    marked ? { number: marked.pr.number, source: 'marker', at: now } : undefined,
  ]);
  if (refs.branch && (!link || RANK[link.source] < RANK.branch)) {
    const found = await env.provider.forBranch(refs.branch);
    const pick = found.find((p) => p.state === 'open') ?? found[0];
    if (pick) link = { number: pick.number, source: 'branch', at: now };
  }
  if (!link) return undefined;
  if (prev?.link.number === link.number && prev.link.source === link.source) link = prev.link;

  const listed = [...byRef.values()].find((c) => c.pr.number === link.number)?.pr;
  const settled =
    prev?.pr?.number === link.number &&
    prev.pr.state !== 'open' &&
    listed?.state === prev.pr.state &&
    listed.updatedAt === prev.pr.updatedAt;
  const pr = settled ? prev.pr! : await env.provider.pull(link.number);
  const checks = settled
    ? prev.checks
    : pr.state === 'closed'
      ? []
      : await env.provider.checks(pr.headSha, env.requiredChecks);
  const checksSummary = summarizeChecks(checks);
  const flags = mismatchFlags(
    { phase, pr, checks: checksSummary, verifiedHead: refs.verifiedHead },
    prev?.flags ?? [],
    now,
  );
  const next: TicketSync = {
    v: 1,
    mapId,
    ticketId: t.id,
    ticketKey: t.key,
    provider: env.provider.name,
    link,
    pr,
    checks,
    checksSummary,
    flags,
    syncedAt: now,
  };
  writeTicketSync(env.root, next);
  logFlagChanges(env.root, prev, next, now);
  return prev && comparable(prev) === comparable(next) ? undefined : next;
}

export function logFlagChanges(root: string, prev: TicketSync | undefined, next: TicketSync | undefined, at: number) {
  const before = prev?.flags ?? [];
  const after = next?.flags ?? [];
  const s = next ?? prev;
  if (!s) return;
  const base = { v: 1 as const, at, mapId: s.mapId, ticketId: s.ticketId, ticketKey: s.ticketKey };
  for (const f of after)
    if (!before.some((b) => b.kind === f.kind))
      appendFlagEntry(root, { ...base, kind: 'flag.raised', flag: f.kind, text: f.text });
  for (const f of before)
    if (!after.some((a) => a.kind === f.kind))
      appendFlagEntry(root, { ...base, kind: 'flag.cleared', flag: f.kind, text: f.text });
}

/**
 * One reconciler tick: finds each ticket's PR, reads its state and checks,
 * and raises or clears mismatch flags in `sync.json`. It never writes to the
 * tracker. A ticket that cannot be read keeps its last snapshot and flags,
 * marked with `error`; a rate limit aborts the whole tick.
 */
export async function reconcile(env: ReconcileEnv): Promise<ReconcileResult> {
  const now = (env.now ?? Date.now)();
  const byRef = new Map<string, PrCandidate>();
  for (const c of await env.provider.recent()) for (const ref of c.markers) if (!byRef.has(ref)) byRef.set(ref, c);
  const changed: TicketSync[] = [];
  const failures: string[] = [];
  for (const summary of await env.adapter.listMaps()) {
    const snap = await env.adapter.loadMap(summary.id);
    const phases = derivePhases(snap.tickets, snap.map.mode);
    for (const t of snap.tickets) {
      try {
        const s = await reconcileTicket(env, snap.map.id, t, phases.get(t.id)!, byRef, now);
        if (s) changed.push(s);
      } catch (e) {
        if (e instanceof TrackerError && e.code === 'rate_limited') throw e;
        const reason = redact(String((e as Error)?.message ?? e)).slice(0, 300);
        failures.push(`${t.key}: ${reason}`);
        const prev = readTicketSync(env.root, snap.map.id, t.id);
        if (prev && prev.error !== reason) {
          const marked = { ...prev, error: reason };
          writeTicketSync(env.root, marked);
          changed.push(marked);
        }
      }
    }
  }
  return { changed, failures };
}
