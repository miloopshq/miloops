import type { AttemptResult, CheckResult, VerificationConfig } from '../model/verification';
import { checkPassed, runCheck, type CheckRun } from './runCheck';

export interface ChecksOutcome {
  checks: CheckResult[];
  result: Exclude<AttemptResult, 'interrupted'>;
  /** Why the result is `error`, or why checks were skipped. */
  note?: string;
}

/**
 * Runs the named checks in order within the config's total budget.
 * `fail`: a check ran and did not pass (non-zero exit, timeout). `error`: the
 * checks could not be run as configured (unknown name, missing binary, bad
 * cwd), which needs a human rather than another attempt.
 */
export async function runChecks(
  config: VerificationConfig,
  names: string[],
  run: Omit<CheckRun, 'timeoutMs'>,
): Promise<ChecksOutcome> {
  const unknown = names.filter((n) => !config.checks[n]);
  if (unknown.length) return { checks: [], result: 'error', note: `unknown check ${unknown.join(', ')}` };
  const deadline = Date.now() + config.totalTimeoutSec * 1000;
  const checks: CheckResult[] = [];
  let note: string | undefined;
  for (const name of names) {
    const left = deadline - Date.now();
    if (left <= 0) {
      note = `total timeout of ${config.totalTimeoutSec} s reached before ${name}`;
      break;
    }
    if (run.signal?.aborted) {
      note = 'cancelled';
      break;
    }
    const spec = config.checks[name];
    const r = await runCheck(name, spec, { ...run, timeoutMs: Math.min(spec.timeoutSec * 1000, left) });
    checks.push(r);
    if (!checkPassed(r) && config.failFast) break;
  }
  const broken = checks.find((c) => c.error);
  if (broken) return { checks, result: 'error', note: `${broken.name}: ${broken.error}` };
  if (note) return { checks, result: 'fail', note };
  return { checks, result: checks.every(checkPassed) ? 'pass' : 'fail' };
}
