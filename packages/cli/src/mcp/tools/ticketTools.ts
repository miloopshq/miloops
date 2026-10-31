import { z } from 'zod';
import type { MissionAgent } from '../agent';
import { type DefineTool, mission, ticket, ticketType } from '../toolKit';

/** Ticket tools: pick, claim, release and add tickets. */
export function registerTicketTools(tool: DefineTool, agent: MissionAgent) {
  tool(
    'next_ticket',
    {
      title: 'Next ready ticket',
      description:
        'The oldest open, unblocked, unclaimed ticket, with its body, blockers and the decisions they produced. Does not claim it.',
      readOnly: true,
    },
    { mission, types: z.array(ticketType).optional() },
    (a) => agent.nextTicket(a),
  );

  tool(
    'claim_ticket',
    {
      title: 'Claim a ticket',
      description:
        'Assign a ticket to you (default: the next ready one) and start working it. Fails if another agent got it first.',
    },
    { mission, ticket: ticket.optional() },
    (a) => agent.claimTicket(a),
  );

  tool(
    'release_ticket',
    { title: 'Release a ticket', description: 'Give a claimed ticket back to the frontier without closing it.' },
    { mission, ticket: ticket.optional(), reason: z.string().optional() },
    (a) => agent.releaseTicket(a),
  );

  tool(
    'add_ticket',
    {
      title: 'Add a ticket',
      description:
        'Add a ticket to the mission, optionally blocked by existing tickets, or promote a Not yet specified line (fromUnspecified).',
    },
    {
      mission,
      title: z.string().min(1),
      type: ticketType,
      body: z.string().optional(),
      hitl: z.boolean().optional(),
      blockedBy: z.array(z.string()).optional(),
      fromUnspecified: z.string().optional(),
    },
    (a) => agent.addTicket(a),
  );
}
