import type { TicketPhase } from '../model/lifecycle';
import type { ChecksSummary, PullRequestSnapshot, SyncFlag, SyncFlagKind } from '../model/prEvidence';

export interface MismatchInput {
  phase: TicketPhase;
  pr: PullRequestSnapshot;
  checks: ChecksSummary;
  /** Commit the latest passing attempt verified, when git evidence recorded one. */
  verifiedHead?: string;
}

const IN_PROGRESS: TicketPhase[] = ['working', 'verifying', 'rework'];

/**
 * Where the ticket and its PR disagree. Flags inform the operator; nothing
 * here, or in the reconciler, changes the ticket.
 */
export function mismatchFlags(m: MismatchInput, prev: SyncFlag[], now: number): SyncFlag[] {
  const { phase, pr } = m;
  const raised: [SyncFlagKind, SyncFlag['severity'], string][] = [];
  const live = pr.state !== 'closed';
  if (phase === 'done' && pr.state === 'open')
    raised.push(['done-pr-open', 'warn', `Ticket is done but PR #${pr.number} is still open`]);
  if (pr.state === 'merged' && IN_PROGRESS.includes(phase))
    raised.push(['pr-merged-not-done', 'alert', `PR #${pr.number} merged while the ticket is ${phase}`]);
  if (pr.state === 'closed' && phase !== 'cancelled')
    raised.push([
      'pr-closed-unmerged',
      phase === 'done' ? 'alert' : 'warn',
      `PR #${pr.number} was closed without merging`,
    ]);
  if (live && m.checks === 'failing')
    raised.push(['required-checks-failing', 'alert', `Required checks failing on PR #${pr.number}`]);
  if (live && m.checks === 'unknown')
    raised.push(['checks-unknown', 'warn', `Required checks on PR #${pr.number} have no readable result`]);
  if (live && m.verifiedHead && pr.headSha && !pr.headSha.startsWith(m.verifiedHead.toLowerCase()))
    raised.push([
      'pr-head-not-verified',
      'alert',
      `PR #${pr.number} head ${pr.headSha.slice(0, 7)} is not the verified commit ${m.verifiedHead.slice(0, 7)}`,
    ]);
  const since = new Map(prev.map((f) => [f.kind, f.since]));
  return raised.map(([kind, severity, text]) => ({ kind, severity, text, since: since.get(kind) ?? now }));
}
