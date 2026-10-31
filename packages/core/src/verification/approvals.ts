import type { MapSnapshot } from '../model/types';
import { derivePhases } from '../planning/lifecycle/phase';
import { readAttempts, readVerdicts } from './evidenceStore';
import { levelFor } from './verifyCompletion';

/** A ticket waiting on the operator: to approve a reviewed pass, or to decide a held one. */
export interface ApprovalItem {
  kind: 'approve' | 'held';
  mapId: string;
  ticketId: string;
  ticketKey: string;
  title: string;
  attemptId?: string;
  /** Why it waits, in one line: the review, the failed checks, or what could not run. */
  reason: string;
  at: number;
}

const clip = (s: string) => (s.length > 200 ? `${s.slice(0, 199)}…` : s);

/** Tickets of a mission that wait on the operator, oldest first. */
export function approvalItems(root: string, snap: MapSnapshot): ApprovalItem[] {
  const phases = derivePhases(snap.tickets, snap.map.mode);
  const items: ApprovalItem[] = [];
  for (const t of snap.tickets) {
    const phase = phases.get(t.id);
    if (phase !== 'verifying' && phase !== 'blocked') continue;
    const last = readAttempts(root, snap.map.id, t.id).at(-1);
    const verdict = last
      ? readVerdicts(root, snap.map.id, t.id)
          .filter((v) => v.attemptId === last.id)
          .at(-1)
      : undefined;
    const base = { mapId: snap.map.id, ticketId: t.id, ticketKey: t.key, title: t.title, attemptId: last?.id };
    if (phase === 'blocked') {
      const why =
        verdict?.verdict === 'NEEDS_HUMAN'
          ? `${verdict.by} asks you to decide: ${verdict.summary}`
          : last?.result === 'fail'
            ? `${last.id} failed its checks too many times`
            : (last?.note ?? 'verification could not run');
      items.push({ ...base, kind: 'held', reason: clip(why), at: verdict?.at ?? last?.finishedAt ?? t.updatedAt });
      continue;
    }
    if (last?.result !== 'pass' || verdict?.byKind !== 'agent' || verdict.verdict !== 'PASS') continue;
    if (levelFor(root, snap, t).info.level !== 'checks+review+human') continue;
    items.push({
      ...base,
      kind: 'approve',
      reason: clip(`${verdict.by} reviewed: ${verdict.summary}`),
      at: verdict.at,
    });
  }
  return items.sort((a, b) => a.at - b.at);
}
