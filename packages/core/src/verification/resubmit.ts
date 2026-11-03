import type { VerificationAttempt } from '../model/verification';
import type { Submission } from './verifyCompletion';

/** The submission an attempt kept, to run its checks again. */
export const submissionOf = (a: VerificationAttempt): Submission => ({
  agent: a.agent,
  sessionId: a.sessionId,
  resolution: a.resolution,
  summary: a.summary,
  rationale: a.rationale,
  alternatives: a.alternatives,
  noCodeReason: a.noCodeReason,
  pr: a.pr,
  criteria: a.criteria?.evidence,
});
