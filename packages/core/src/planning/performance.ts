import { vendorOf } from '../agents/vendorOf';
import type { TransitionEntry } from '../model/lifecycle';
import type { MapSnapshot } from '../model/types';
import { type DeliveryInput, type TicketDelivery, deliveryReport } from './delivery';
import { type Recommendation, performanceRecommendations } from './performanceRecommendations';

/** One agent, vendor or ticket type, across every trail. */
export interface PerformanceRow {
  key: string;
  tickets: number;
  done: number;
  cancelled: number;
  open: number;
  /** Median first-claim-to-done over done tickets. */
  medianLeadMs?: number;
  /** Times this group's work went back to rework. */
  reworkCycles: number;
  /** Verdicts on this group's work. */
  reviews: { passed: number; failed: number; needsHuman: number };
  /** Questions this group asked that a person answered. Not counted for ticket types: a question isn't tied to one. */
  answers: number;
  /** Findings this group raised as a reviewer; upheld unless the trail lead accepted the work anyway. */
  findings: { raised: number; upheld: number };
}

export interface PerformanceReport {
  trails: number;
  tickets: number;
  byAgent: PerformanceRow[];
  byVendor: PerformanceRow[];
  byType: PerformanceRow[];
  /** Ticket type then vendor, for the recommendations. */
  byTypeAndVendor: Record<string, PerformanceRow[]>;
  /** Information only: nothing is routed from these. */
  recommendations: Recommendation[];
}

interface Attributed {
  ticket: TicketDelivery;
  /** The agent that last claimed it, or its assignee. */
  agent?: string;
}

const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

const lastClaim = (entries: TransitionEntry[]) =>
  entries.filter((e) => e.event === 'claim' && e.actorKind === 'agent').at(-1)?.actor;

const entriesOf = (journal: TransitionEntry[], mapId: string, ticketId: string) =>
  journal.filter((e) => e.mapId === mapId && e.ticketId === ticketId).sort((a, b) => a.at - b.at);

/** Each review ticket's reviewer and whether its failure stood, from the verdict that followed its claim. */
function findingsOf(snap: MapSnapshot, journal: TransitionEntry[]) {
  return snap.tickets.flatMap((review) => {
    if (review.type !== 'review' || !review.reviewOf) return [];
    const claims = entriesOf(journal, snap.map.id, review.id);
    const reviewer = lastClaim(claims);
    if (!reviewer) return [];
    const claimedAt = claims.filter((e) => e.event === 'claim').at(-1)?.at ?? 0;
    const onWork = entriesOf(journal, snap.map.id, review.reviewOf);
    const i = onWork.findIndex((e) => e.at >= claimedAt && e.event.startsWith('review.'));
    if (i < 0 || onWork[i].event !== 'review.fail') return [];
    const later = onWork.slice(i + 1);
    const next = later.findIndex((e) => e.event.startsWith('review.'));
    const until = next < 0 ? later : later.slice(0, next);
    return [{ reviewer, upheld: !until.some((e) => e.event === 'accept' && e.actorKind === 'trail lead') }];
  });
}

/** A ticket's assignee, when it's an agent's trail name (`codex-03`). People assigned to a ticket aren't agents or vendors. */
function agentAssignee(snap: MapSnapshot, ticketId: string) {
  const assignee = snap.tickets.find((t) => t.id === ticketId)?.assignee;
  return assignee && /^[a-z]+-\d+$/.test(assignee) ? assignee : undefined;
}

function row(key: string, items: Attributed[]): PerformanceRow {
  const sum = (f: (t: TicketDelivery) => number) => items.reduce((n, { ticket }) => n + f(ticket), 0);
  const count = (outcome: TicketDelivery['outcome']) => items.filter((i) => i.ticket.outcome === outcome).length;
  return {
    key,
    tickets: items.length,
    done: count('done'),
    cancelled: count('cancelled'),
    open: count('open'),
    medianLeadMs: median(items.flatMap(({ ticket }) => (ticket.leadMs === undefined ? [] : [ticket.leadMs]))),
    reworkCycles: sum((t) => t.reworks),
    reviews: {
      passed: sum((t) => t.reviews.passed),
      failed: sum((t) => t.reviews.failed),
      needsHuman: sum((t) => t.reviews.needsHuman),
    },
    answers: 0,
    findings: { raised: 0, upheld: 0 },
  };
}

function groupRows(items: Attributed[], keyOf: (i: Attributed) => string | undefined) {
  const groups = new Map<string, Attributed[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key) groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return new Map([...groups].map(([key, list]) => [key, row(key, list)]));
}

/** Rows for reviewers or askers who claimed no work still appear, so nobody's reviews go missing. */
const rowFor = (rows: Map<string, PerformanceRow>, key: string) => {
  const found = rows.get(key) ?? row(key, []);
  rows.set(key, found);
  return found;
};

function creditFinding(rows: Map<string, PerformanceRow>, key: string, upheld: boolean) {
  const r = rowFor(rows, key);
  r.findings.raised += 1;
  if (upheld) r.findings.upheld += 1;
}

const sorted = (rows: Map<string, PerformanceRow>) =>
  [...rows.values()].sort((a, b) => b.tickets - a.tickets || a.key.localeCompare(b.key));

/** `metrics.delivery` grouped by agent, vendor and ticket type, across trails. Same inputs, same report. */
export function performanceReport(trails: DeliveryInput[]): PerformanceReport {
  const items: Attributed[] = trails.flatMap(({ snap, journal, answered, usage }) =>
    deliveryReport({ snap, journal, answered, usage }).tickets.map((ticket) => ({
      ticket,
      // Tickets closed before the journal existed still name who worked on them.
      agent: lastClaim(entriesOf(journal, snap.map.id, ticket.id)) ?? agentAssignee(snap, ticket.id),
    })),
  );
  const vendorKey = (i: Attributed) => (i.agent ? vendorOf(i.agent) : undefined);
  const byAgent = groupRows(items, (i) => i.agent);
  const byVendor = groupRows(items, vendorKey);
  const byType = groupRows(items, (i) => i.ticket.type);

  const seen = new Set<string>();
  for (const { snap, journal, answered } of trails) {
    for (const q of answered) {
      const id = `${q.mapId}/${q.id}`;
      if (q.mapId !== snap.map.id || seen.has(id)) continue;
      seen.add(id);
      rowFor(byAgent, q.agent).answers += 1;
      rowFor(byVendor, vendorOf(q.agent)).answers += 1;
    }
    for (const finding of findingsOf(snap, journal)) {
      creditFinding(byAgent, finding.reviewer, finding.upheld);
      creditFinding(byVendor, vendorOf(finding.reviewer), finding.upheld);
    }
  }

  const byTypeAndVendor = Object.fromEntries(
    [...byType.keys()].map((type) => [
      type,
      sorted(
        groupRows(
          items.filter((i) => i.ticket.type === type),
          vendorKey,
        ),
      ),
    ]),
  );
  const report = {
    trails: trails.length,
    tickets: items.length,
    byAgent: sorted(byAgent),
    byVendor: sorted(byVendor),
    byType: sorted(byType),
    byTypeAndVendor,
  };
  return { ...report, recommendations: performanceRecommendations(report) };
}
