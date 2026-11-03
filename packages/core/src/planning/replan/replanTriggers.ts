import type { DecisionRecord, MapSnapshot, Ticket } from '../../model/types';

export type ReplanTrigger =
  'blocked-after-attempts' | 'superseded-decision' | 'cancelled-with-dependents' | 'pr-closed-unmerged';

/** A sign the plan may be wrong. It only suggests a replan: nothing is proposed or changed by itself. */
export interface ReplanSuggestion {
  /** Stable across runs, e.g. `superseded-decision:D-3`, so attention can track and snooze it. */
  id: string;
  mapId: string;
  trigger: ReplanTrigger;
  ticketId?: string;
  decisionId?: string;
  /** What happened, in a sentence. */
  reason: string;
  /** Ticket ids the suggestion is about. */
  tickets: string[];
}

export interface TriggerInput {
  snap: MapSnapshot;
  decisions: DecisionRecord[];
  /** Failed verification attempts per ticket id. */
  failures?: Record<string, number>;
  /** The mission's `maxAttempts` (verification.json). */
  maxAttempts?: number;
  /** Ticket ids whose linked pull request was closed without merging. */
  closedUnmerged?: string[];
}

/**
 * Replan suggestions from the signals already in the tracker: a ticket blocked after its last allowed attempt, a
 * superseded decision whose dependent tickets are done, a cancelled ticket open tickets still wait on, and a pull
 * request closed without merging. Pure and ordered, so the same inputs give the same list.
 */
export function replanTriggers(input: TriggerInput): ReplanSuggestion[] {
  const { snap } = input;
  const byId = new Map(snap.tickets.map((t) => [t.id, t]));
  const dependents = (id: string) => snap.tickets.filter((t) => t.blockedBy.includes(id));
  const suggest = (s: Omit<ReplanSuggestion, 'mapId'>): ReplanSuggestion => ({ ...s, mapId: snap.map.id });
  return [
    ...blockedAfterAttempts(input).map(suggest),
    ...supersededWithDoneDependents(input.decisions, { byId, dependents }).map(suggest),
    ...cancelledWithOpenDependents(snap.tickets, dependents).map(suggest),
    ...(input.closedUnmerged ?? []).flatMap((id) => {
      const t = byId.get(id);
      if (!t || t.state === 'closed') return [];
      const reason = `${t.key}'s pull request was closed without merging`;
      return [
        suggest({ id: `pr-closed-unmerged:${id}`, trigger: 'pr-closed-unmerged', ticketId: id, reason, tickets: [id] }),
      ];
    }),
  ];
}

function blockedAfterAttempts(input: TriggerInput): Omit<ReplanSuggestion, 'mapId'>[] {
  const max = input.maxAttempts;
  if (!max) return [];
  return input.snap.tickets
    .filter((t) => t.state === 'open' && t.status === 'blocked' && (input.failures?.[t.id] ?? 0) >= max)
    .map((t) => ({
      id: `blocked-after-attempts:${t.id}`,
      trigger: 'blocked-after-attempts' as const,
      ticketId: t.id,
      reason: `${t.key} failed ${input.failures?.[t.id]} attempts and is blocked: the approach may be wrong`,
      tickets: [t.id],
    }));
}

function supersededWithDoneDependents(
  decisions: DecisionRecord[],
  graph: { byId: Map<string, Ticket>; dependents: (id: string) => Ticket[] },
): Omit<ReplanSuggestion, 'mapId'>[] {
  return decisions.flatMap((d) => {
    if (!d.supersededBy || !d.ticketId) return [];
    const done = graph.dependents(d.ticketId).filter((t) => t.state === 'closed' && t.closeReason === 'completed');
    if (!done.length) return [];
    const keys = done.map((t) => t.key).join(', ');
    return [
      {
        id: `superseded-decision:${d.id}`,
        trigger: 'superseded-decision' as const,
        decisionId: d.id,
        ticketId: d.ticketId,
        reason: `${d.id} was superseded by ${d.supersededBy}, but ${keys} built on it and ${done.length === 1 ? 'is' : 'are'} done`,
        tickets: done.map((t) => t.id),
      },
    ];
  });
}

function cancelledWithOpenDependents(
  tickets: Ticket[],
  dependents: (id: string) => Ticket[],
): Omit<ReplanSuggestion, 'mapId'>[] {
  return tickets.flatMap((t) => {
    if (t.closeReason !== 'not_planned') return [];
    const open = dependents(t.id).filter((x) => x.state === 'open');
    if (!open.length) return [];
    return [
      {
        id: `cancelled-with-dependents:${t.id}`,
        trigger: 'cancelled-with-dependents' as const,
        ticketId: t.id,
        reason: `${t.key} was cancelled, but ${open.map((x) => x.key).join(', ')} still ${open.length === 1 ? 'depends' : 'depend'} on it`,
        tickets: open.map((x) => x.id),
      },
    ];
  });
}
