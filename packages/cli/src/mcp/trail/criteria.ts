import {
  CRITERION_KINDS,
  criteriaRequired,
  numbered,
  OperationError,
  uncoveredRules,
  type CriterionKind,
  type MapSnapshot,
  type Ticket,
} from '@teamtrail/core';
import { readBrief, readCriteria, writeTicketCriteria } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { knowledgeFor } from './knowledge';

export type CriterionInput = { text: string; kind: CriterionKind; source?: string };

/** Writes a ticket's criteria, numbered AC-1, AC-2, … (replacing earlier ones and clearing the trail lead's confirm). */
export function saveCriteria(root: string, map: { id: string; title: string }, t: Ticket, items: CriterionInput[]) {
  const bad = items.find((c) => !CRITERION_KINDS.includes(c.kind) || !c.text.trim());
  if (bad) throw new OperationError(`each criterion needs text and a kind (${CRITERION_KINDS.join(', ')})`);
  return writeTicketCriteria(root, map, t, { criteria: numbered(items) });
}

/** What an agent sees about a ticket's criteria: the list, whether they're required, and business rules to cover. */
export function criteriaView(root: string, snap: MapSnapshot, t: Ticket, level: string) {
  const entry = readCriteria(root, snap.map.id).find((x) => x.ticketId === t.id);
  const required = criteriaRequired(!!readBrief(root, snap.map.id), t.type, level as never);
  const rules = (knowledgeFor(root, snap, t) ?? []).filter((k) => k.kind === 'business-rule');
  const uncovered = uncoveredRules(
    entry?.criteria ?? [],
    rules.map((r) => r.id),
  );
  if (!entry?.criteria.length && !required && !uncovered.length) return undefined;
  return {
    list: entry?.criteria ?? [],
    ...(entry?.confirmed ? { confirmedByHuman: true } : {}),
    required,
    ...(required && !entry?.criteria.length
      ? { next: 'Write acceptance criteria with set_criteria before you start: what must be true for this to be done.' }
      : {}),
    ...(uncovered.length
      ? {
          suggested: rules
            .filter((r) => uncovered.includes(r.id))
            .map((r) => ({ text: r.title, kind: 'business-rule', source: r.id })),
        }
      : {}),
    evidence:
      'When completing, give evidence per criterion: check:<name> (from verification.json), test:<name>, command:<cmd>, pr, or manual (the human signs off).',
  };
}

export async function setCriteria(
  ctx: AgentContext,
  input: { trail?: string; ticket: string; criteria: CriterionInput[] },
) {
  const snap = await ctx.resolveTrail(input.trail);
  const t = ctx.findTicket(snap, input.ticket);
  if (t.state === 'closed') throw new OperationError(`${t.key} is closed`);
  if (t.status === 'verifying')
    throw new OperationError(`${t.key} is being verified; its criteria are fixed until then`);
  const saved = saveCriteria(ctx.root, snap.map, t, input.criteria);
  ctx.sessions.current?.log(`${t.key}: ${saved.criteria.length} acceptance criteria`, 'ok');
  return { ticket: t.key, criteria: saved.criteria };
}

/** Refuses a completion that needs criteria and has none. */
export function assertCriteria(root: string, snap: MapSnapshot, t: Ticket, level: string) {
  if (!criteriaRequired(!!readBrief(root, snap.map.id), t.type, level as never)) return;
  if (readCriteria(root, snap.map.id).find((x) => x.ticketId === t.id)?.criteria.length) return;
  throw new OperationError(
    `${t.key} needs acceptance criteria before it can be completed: call set_criteria with what must be true, then complete it with evidence for each.`,
  );
}
