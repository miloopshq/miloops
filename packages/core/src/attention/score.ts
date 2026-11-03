import type { AttentionPolicy, AttentionUrgency } from '../model/attention';
import type { Candidate } from './types';

/** What one candidate scores, and why. Points are added in a fixed order so reasons read the same way. */
export interface Scored {
  score: number;
  reasons: string[];
}

const URGENCY_POINTS: Record<AttentionUrgency, number> = { blocking: 25, soon: 10, fyi: 0 };

const URGENCY_REASON: Record<AttentionUrgency, string | undefined> = {
  blocking: 'marked blocking',
  soon: undefined,
  fyi: 'fyi, when convenient',
};

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** `12 min`, `3 h`, `2 days`. */
export function waitLabel(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return plural(Math.floor(h / 24), 'day');
}

/**
 * The score: half the kind's weight (0–50), the urgency (0–25), 4 per held ticket (up to 20),
 * 15 when an agent sits idle, and 1 per 15 minutes of waiting (up to 10).
 */
export function scoreCandidate(input: {
  candidate: Candidate;
  held: number;
  policy: AttentionPolicy;
  now: number;
}): Scored {
  const { candidate: c, held, policy, now } = input;
  const reasons = [...(c.notes ?? [])];
  let score = Math.round(policy.weights[c.kind] / 2);

  score += URGENCY_POINTS[c.urgency];
  const urgencyReason = URGENCY_REASON[c.urgency];
  if (urgencyReason) reasons.push(urgencyReason);

  if (held > 0) {
    score += Math.min(20, held * 4);
    reasons.push(`blocks ${plural(held, 'ticket')}`);
  }

  const waited = Math.max(0, now - c.since);
  if (c.idleAgent) {
    score += 15;
    reasons.push(`${c.idleAgent} idle for ${waitLabel(waited)}`);
  }

  const quarters = Math.floor(waited / (15 * 60_000));
  if (quarters > 0) {
    score += Math.min(10, quarters);
    if (!c.idleAgent) reasons.push(`waiting ${waitLabel(waited)}`);
  }
  return { score, reasons };
}
