import type { CheckState, ChecksSummary, CiCheck } from '../../model/prEvidence';

/** A GitHub check run (`GET /commits/{sha}/check-runs`), trimmed to the fields read. */
export interface GhCheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url?: string;
}

/** A commit status context (`GET /commits/{sha}/status`). */
export interface GhStatus {
  context: string;
  state: string;
  target_url?: string | null;
}

export function checkRunState(r: Pick<GhCheckRun, 'status' | 'conclusion'>): CheckState {
  if (r.status === 'in_progress') return 'RUNNING';
  if (['queued', 'requested', 'waiting', 'pending'].includes(r.status)) return 'PENDING';
  if (r.status !== 'completed') return 'UNKNOWN';
  switch (r.conclusion) {
    case 'success':
    case 'neutral':
    case 'skipped':
      return 'PASSED';
    case 'failure':
    case 'timed_out':
    case 'action_required':
    case 'startup_failure':
      return 'FAILED';
    case 'cancelled':
    case 'stale':
      return 'CANCELLED';
    default:
      return 'UNKNOWN';
  }
}

export function statusState(state: string): CheckState {
  if (state === 'success') return 'PASSED';
  if (state === 'failure' || state === 'error') return 'FAILED';
  if (state === 'pending') return 'PENDING';
  return 'UNKNOWN';
}

const RANK: Record<CheckState, number> = { FAILED: 5, CANCELLED: 4, UNKNOWN: 3, RUNNING: 2, PENDING: 1, PASSED: 0 };

/**
 * One check per name: the newest run of a check-run name (re-runs replace
 * older ones), and the worse of a check run and a status with the same name.
 * Names in `required` that the host has no result for are added as `UNKNOWN`.
 */
export function foldChecks(
  runs: GhCheckRun[],
  statuses: GhStatus[],
  required: string[],
  clean: (s: string, max?: number) => string,
): CiCheck[] {
  const newest = new Map<string, GhCheckRun>();
  for (const r of runs) if ((newest.get(r.name)?.id ?? -1) < r.id) newest.set(r.name, r);
  const out = new Map<string, CiCheck>();
  const req = (name: string) => !required.length || required.includes(name);
  const put = (name: string, state: CheckState, url?: string | null) => {
    const prev = out.get(name);
    if (prev && RANK[prev.state] >= RANK[state]) return;
    const link = url && /^https:\/\/[^\s"'<>]+$/.test(url) ? clean(url, 300) : undefined;
    out.set(name, { name: clean(name), state, required: req(name), ...(link ? { url: link } : {}) });
  };
  for (const r of newest.values()) put(r.name, checkRunState(r), r.html_url);
  for (const s of statuses) put(s.context, statusState(s.state), s.target_url);
  for (const name of required)
    if (!out.has(name)) out.set(name, { name: clean(name), state: 'UNKNOWN', required: true });
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Required checks as one result. Only `passed` counts as a pass. */
export function summarizeChecks(checks: CiCheck[]): ChecksSummary {
  const req = checks.filter((c) => c.required);
  if (!req.length) return 'none';
  if (req.some((c) => c.state === 'FAILED' || c.state === 'CANCELLED')) return 'failing';
  if (req.some((c) => c.state === 'UNKNOWN')) return 'unknown';
  if (req.some((c) => c.state === 'PENDING' || c.state === 'RUNNING')) return 'pending';
  return 'passed';
}
