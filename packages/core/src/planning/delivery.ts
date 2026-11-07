import type { TransitionEntry } from '../model/lifecycle';
import type { AnsweredQuestion, MapSnapshot, SessionUsage, Ticket, TicketType } from '../model/types';

/** One ticket's delivery: from first claim to done, with the rework, reviews and human calls on the way. */
export interface TicketDelivery {
  id: string;
  key: string;
  title: string;
  type: TicketType;
  outcome: 'done' | 'cancelled' | 'open';
  /** First claim (journal), when there was one. */
  claimedAt?: number;
  doneAt?: number;
  /** `doneAt - claimedAt`, done tickets only. */
  leadMs?: number;
  /** Times the ticket went back to rework. */
  reworks: number;
  reviews: { passed: number; failed: number; needsHuman: number };
  /** Lifecycle calls the trail lead made on it: approve, send to rework, accept, unblock, cancel, release. */
  operatorActions: number;
}

/** `metrics.delivery`: outcomes for one trail, computed from data Teamtrail already keeps. Same inputs, same report. */
export interface DeliveryReport {
  mapId: string;
  tickets: TicketDelivery[];
  done: number;
  cancelled: number;
  open: number;
  /** Trail creation to its last done ticket. */
  trailLeadMs?: number;
  /** Median first-claim-to-done over done tickets. */
  medianLeadMs?: number;
  interventions: {
    /** Agent questions answered by a person. */
    answers: number;
    /** Trail lead lifecycle calls (approvals, rework requests, overrides, cancels, releases). */
    operatorActions: number;
    /** Of `operatorActions`: work the trail lead sent back. */
    reworkRequested: number;
    total: number;
  };
  rework: { tickets: number; cycles: number };
  reviews: { passed: number; failed: number; needsHuman: number };
  spend: { costUsd: number; tokens: number; perVerifiedTicketUsd?: number };
}

export interface DeliveryInput {
  snap: MapSnapshot;
  /** The trail's journal (`.events/<mapId>.jsonl`). */
  journal: TransitionEntry[];
  /** Answered agent questions in view; only this trail's are counted. */
  answered: AnsweredQuestion[];
  usage?: SessionUsage;
}

const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

function outcomeOf(t: Ticket): TicketDelivery['outcome'] {
  if (t.state === 'open') return 'open';
  return t.closeReason === 'not_planned' ? 'cancelled' : 'done';
}

export function deliveryReport({ snap, journal, answered, usage }: DeliveryInput): DeliveryReport {
  const mapId = snap.map.id;
  const entries = journal.filter((e) => e.mapId === mapId).sort((a, b) => a.at - b.at);
  const byTicket = new Map<string, TransitionEntry[]>();
  for (const e of entries) byTicket.set(e.ticketId, [...(byTicket.get(e.ticketId) ?? []), e]);

  const tickets = snap.tickets
    .filter((t) => t.type !== 'review')
    .map((t): TicketDelivery => {
      // Review verdicts (review.pass/fail/needs_human) are journaled on the reviewed ticket itself.
      const es = byTicket.get(t.id) ?? [];
      const outcome = outcomeOf(t);
      const claimedAt = es.find((e) => e.event === 'claim')?.at;
      const doneAt = outcome === 'done' ? t.closedAt : undefined;
      return {
        id: t.id,
        key: t.key,
        title: t.title,
        type: t.type,
        outcome,
        claimedAt,
        doneAt,
        leadMs: doneAt && claimedAt && doneAt >= claimedAt ? doneAt - claimedAt : undefined,
        reworks: es.filter((e) => e.to === 'rework').length,
        reviews: {
          passed: es.filter((e) => e.event === 'review.pass').length,
          failed: es.filter((e) => e.event === 'review.fail').length,
          needsHuman: es.filter((e) => e.event === 'review.needs_human').length,
        },
        operatorActions: es.filter((e) => e.actorKind === 'trail lead').length,
      };
    });

  const done = tickets.filter((t) => t.outcome === 'done');
  const lastDone = Math.max(0, ...done.map((t) => t.doneAt ?? 0));
  const operatorEs = entries.filter((e) => e.actorKind === 'trail lead');
  const answers = new Set(answered.filter((q) => q.mapId === mapId).map((q) => q.id)).size;
  const operatorActions = operatorEs.length;
  const sum = (f: (t: TicketDelivery) => number) => tickets.reduce((n, t) => n + f(t), 0);
  const costUsd = usage?.costUsd ?? 0;

  return {
    mapId,
    tickets,
    done: done.length,
    cancelled: tickets.filter((t) => t.outcome === 'cancelled').length,
    open: tickets.filter((t) => t.outcome === 'open').length,
    trailLeadMs: lastDone && lastDone >= snap.map.createdAt ? lastDone - snap.map.createdAt : undefined,
    medianLeadMs: median(done.flatMap((t) => (t.leadMs === undefined ? [] : [t.leadMs]))),
    interventions: {
      answers,
      operatorActions,
      reworkRequested: operatorEs.filter((e) => e.event === 'reject').length,
      total: answers + operatorActions,
    },
    rework: { tickets: tickets.filter((t) => t.reworks > 0).length, cycles: sum((t) => t.reworks) },
    reviews: {
      passed: sum((t) => t.reviews.passed),
      failed: sum((t) => t.reviews.failed),
      needsHuman: sum((t) => t.reviews.needsHuman),
    },
    spend: {
      costUsd: Math.round(costUsd * 1e4) / 1e4,
      tokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
      perVerifiedTicketUsd: done.length && costUsd ? Math.round((costUsd / done.length) * 1e4) / 1e4 : undefined,
    },
  };
}
