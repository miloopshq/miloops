import type { VerificationAttempt } from '../model/verification';

const SHA = /^[0-9a-f]{7,64}$/i;

/**
 * The branch of the newest attempt that recorded one, and the commit the
 * newest passing attempt verified (`git.tree`, from git evidence). Attempts
 * made outside git have neither.
 */
export function ticketRefs(attempts: VerificationAttempt[]): { branch?: string; verifiedHead?: string } {
  const newest = [...attempts].reverse();
  const branch = newest.map((a) => a.git?.tree?.branch).find((b): b is string => !!b && /^[\w./-]{1,200}$/.test(b));
  const head = newest.find((a) => a.result === 'pass')?.git?.tree?.head;
  return { branch, verifiedHead: head && SHA.test(head) ? head.toLowerCase() : undefined };
}
