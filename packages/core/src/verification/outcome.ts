import { evidenceLines } from '../evidence/evidenceSummary';
import type { LifecycleEvent, TicketPhase } from '../model/lifecycle';
import type { CheckResult, VerificationAttempt } from '../model/verification';

export interface Outcome {
  event: Extract<LifecycleEvent, 'checks.pass' | 'checks.fail' | 'checks.error'>;
  to: TicketPhase;
  reason: string;
}

const ok = (c: CheckResult) => c.exitCode === 0 && !c.timedOut && !c.error;

/** One line per check, as the ticket comment and the journal show it. */
export const checkLine = (c: CheckResult) =>
  `${c.name} ${ok(c) ? 'passed' : c.timedOut ? 'timed out' : c.error ? `could not run (${c.error})` : `exited ${c.exitCode ?? c.signal}`}`;

/**
 * Where a finished attempt sends the ticket. A pass is done at level `checks`
 * and waits for review above it; a fail goes back for rework until
 * `maxAttempts` failures, then to a human; an error (checks that cannot run
 * as configured) always goes to a human.
 */
export function outcomeOf(a: VerificationAttempt, failures: number, maxAttempts: number): Outcome {
  const ran = a.checks.map(checkLine).join(', ') || 'no checks configured';
  if (a.result === 'pass')
    return { event: 'checks.pass', to: a.level === 'checks' ? 'done' : 'verifying', reason: `${a.id} passed: ${ran}` };
  if (a.result === 'fail') {
    const last = failures >= maxAttempts;
    return {
      event: 'checks.fail',
      to: last ? 'blocked' : 'rework',
      reason: `${a.id} failed (${failures} of ${maxAttempts} attempts${last ? ', needs you' : ''}): ${
        a.checks
          .filter((c) => !ok(c))
          .map(checkLine)
          .join(', ') || a.note
      }`,
    };
  }
  return { event: 'checks.error', to: 'blocked', reason: `${a.id} could not verify: ${a.note ?? ran}` };
}

/** The ticket comment for a finished attempt: result, checks, and the output of the first failing one. */
export function attemptComment(a: VerificationAttempt, o: Outcome) {
  const head = {
    done: 'passed · done',
    verifying: 'passed · waiting for review',
    rework: 'failed · back for rework',
    blocked: a.result === 'fail' ? 'failed · needs a human' : 'could not run · needs a human',
  }[o.to as 'done'];
  const failed = a.checks.find((c) => !ok(c));
  const tail = failed?.tail.split('\n').slice(-20).join('\n');
  return [
    `**Verification ${a.id} ${head ?? o.to}**`,
    '',
    ...a.checks.map((c) => `- ${checkLine(c)} · ${(c.durationMs / 1000).toFixed(1)} s`),
    ...(a.note ? ['', a.note] : []),
    ...(a.git ? ['', ...evidenceLines(a.git)] : []),
    ...(failed && tail
      ? ['', `\`${failed.name}\` output (last lines):`, '', '```', tail.replace(/```/g, "'''"), '```']
      : []),
  ].join('\n');
}
