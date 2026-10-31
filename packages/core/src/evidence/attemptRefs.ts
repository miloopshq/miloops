import type { VerificationAttempt } from '../model/verification';

const SHA = /^[0-9a-f]{7,64}$/i;

/**
 * The branch of the newest attempt that recorded one, and the commit the
 * newest passing attempt verified (`git.tree`, from git evidence), and the PR
 * the newest attempt that named one named. Attempts made outside git have no
 * branch or head.
 */
export function ticketRefs(attempts: VerificationAttempt[]): { branch?: string; verifiedHead?: string; pr?: number } {
  const newest = [...attempts].reverse();
  const pr = newest.map((a) => a.pr).find((n): n is number => Number.isInteger(n) && n! > 0);
  const branch = newest.map((a) => a.git?.tree?.branch).find((b): b is string => !!b && /^[\w./-]{1,200}$/.test(b));
  const head = newest.find((a) => a.result === 'pass')?.git?.tree?.head;
  return { branch, verifiedHead: head && SHA.test(head) ? head.toLowerCase() : undefined, ...(pr ? { pr } : {}) };
}
