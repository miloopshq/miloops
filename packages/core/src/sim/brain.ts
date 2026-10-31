import type { MapSnapshot, Ticket, TicketType } from '../model/types';
import { type ChartPlan } from '../planning/operations/chart';
import { ANSWERS, DETAILS, hash, pick, TRACES } from './brainData';
import { chartPlanFor } from './chartPlan';
import { conversationFor, type Conversation } from './conversations';

/**
 * Decisions an agent makes while running a procedure. The simulated
 * brain returns canned content; a real one would be an LLM session.
 */
export interface AgentBrain {
  planMap(input: { title: string; destination: string }): Promise<ChartPlan>;
  /** AFK resolution: progress lines emitted while resolving, then the answer. */
  resolve(
    ticket: Ticket,
    snap: MapSnapshot,
  ): { trace: string[]; answer: string; alternatives: string[]; rationale: string };
  /** HITL resolution: a scripted conversation with the human, then a drafted answer. */
  converse(ticket: Ticket, snap: MapSnapshot): Conversation;
  /** After recording, optionally promote an unspecified item or rule one out. */
  planMove(
    snap: MapSnapshot,
  ):
    | { kind: 'graduate'; unspecified: string; type: TicketType; blockedBy: string[] }
    | { kind: 'rule'; unspecified: string; reason: string }
    | null;
}

export type { Conversation } from './conversations';

export function simulatedBrain(): AgentBrain {
  return {
    async planMap({ title, destination }) {
      return chartPlanFor(title, destination);
    },
    resolve(ticket) {
      const h = hash(ticket.id + ticket.title);
      const i = Math.abs(h) % ANSWERS[ticket.type].length;
      const [alternatives, rationale] = DETAILS[ticket.type][i] ?? [[], ''];
      return { trace: TRACES[ticket.type], answer: ANSWERS[ticket.type][i], alternatives, rationale };
    },
    converse(ticket, snap) {
      return conversationFor(ticket, snap);
    },
    planMove(snap) {
      const unspecified = snap.map.sections.unspecified;
      if (!unspecified.length) return null;
      const h = hash(unspecified.join('|') + snap.tickets.length);
      const item = pick(unspecified, h);
      if (h % 4 === 0) return { kind: 'rule', unspecified: item, reason: 'not needed to reach the destination' };
      const open = snap.tickets.filter((t) => t.state === 'open');
      const dep = open.length ? [pick(open, h).id] : [];
      return {
        kind: 'graduate',
        unspecified: item,
        type: pick<TicketType>(['research', 'prototype', 'task', 'grilling', 'execute'], h >> 3),
        blockedBy: h % 3 === 0 ? [] : dep,
      };
    },
  };
}
