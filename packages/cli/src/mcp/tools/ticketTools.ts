import { CRITERION_KINDS, type CriterionKind } from '@miloops-hq/core';
import { z } from 'zod';
import type { MissionAgent } from '../agent';
import { type DefineTool, mission, ticket, ticketType } from '../toolKit';

/** Ticket tools: pick, claim, release and add tickets. */
const criteriaInput = z.array(
  z.object({
    text: z.string().min(1),
    kind: z.enum(CRITERION_KINDS as [CriterionKind, ...CriterionKind[]]),
    source: z.string().optional().describe('The knowledge entry it comes from, e.g. K-3.'),
  }),
);

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
    {
      mission,
      ticket: ticket.optional(),
      touches: z
        .array(z.string().min(1).max(300))
        .max(50)
        .optional()
        .describe(
          'Path globs you expect to change (e.g. ["src/notify/**", "package.json"]). Another live claim on the same files comes back as a warning, and the human sees the overlap.',
        ),
      workspace: z
        .boolean()
        .optional()
        .describe(
          'Ask for your own git worktree and branch for this ticket (default: the project setting). The result gives its path: edit files there.',
        ),
    },
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
      criteria: criteriaInput.optional().describe('Acceptance criteria: what must be true for this ticket to be done.'),
    },
    (a) => agent.addTicket(a),
  );

  tool(
    'set_criteria',
    {
      title: 'Set acceptance criteria',
      description:
        "What must be true for a ticket to be done, agreed before the work starts. Replaces the ticket's criteria (numbered AC-1, AC-2, …). Cover the business rules suggested with the claim. When completing, give evidence for each.",
    },
    { mission, ticket, criteria: criteriaInput },
    (a) => agent.setCriteria(a),
  );
}
