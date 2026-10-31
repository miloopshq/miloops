import { z } from 'zod';
import type { MissionAgent } from '../agent';
import { type DefineTool, mission, ticket } from '../toolKit';

/** Tools used while working a ticket: progress, closing it, decisions. */
export function registerWorkTools(tool: DefineTool, agent: MissionAgent) {
  tool(
    'report_progress',
    {
      title: 'Report progress',
      description:
        'Show progress live in the command center: a step of the session procedure (work: Load mission, Claim, Resolve, Record, Update plan; research: Claim, Investigate, Record), a log line, a chat message to the human. Token and cost usage is read from Claude Code and Codex session logs; pass inputTokens/outputTokens/costUsd only when your client has no such log and you actually know them (since your last report).',
    },
    {
      message: z.string().optional().describe('Log line, or detail for the step.'),
      step: z.union([z.string(), z.number().int()]).optional(),
      level: z.enum(['info', 'ok', 'warn', 'alert']).optional(),
      say: z.string().optional().describe('Message shown in the session conversation.'),
      inputTokens: z.number().nonnegative().optional().describe('Input tokens used since the last report.'),
      outputTokens: z.number().nonnegative().optional(),
      costUsd: z.number().nonnegative().optional().describe('Spend in USD since the last report.'),
    },
    (a) => agent.report(a),
  );

  tool(
    'close_ticket',
    {
      title: 'Close a ticket',
      description:
        'Resolve a ticket (default: the one you claimed): posts the resolution, closes it, records a DecisionRecord (with the HITL transcript of this session) and unblocks dependants. outcome "out_of_scope" rules it out instead.',
    },
    {
      mission,
      ticket: ticket.optional(),
      resolution: z.string().min(1).describe('The decision or what was done, in full.'),
      summary: z
        .string()
        .optional()
        .describe('One line for the Decisions list. Default: first sentence of the resolution.'),
      rationale: z.string().optional(),
      alternatives: z.array(z.string()).optional(),
      outcome: z.enum(['completed', 'out_of_scope']).optional(),
      postTranscript: z.boolean().optional().describe('Also post the question/answer transcript as a ticket comment.'),
    },
    (a) => agent.closeTicket(a),
  );

  tool(
    'record_decision',
    {
      title: 'Record a decision',
      description:
        'Keep a DecisionRecord (question, answer, rationale, alternatives, who decided) and add it to the mission Decisions, without closing a ticket.',
    },
    {
      mission,
      ticket: ticket.optional(),
      question: z.string().min(1),
      answer: z.string().min(1),
      summary: z.string().optional(),
      rationale: z.string().optional(),
      alternatives: z.array(z.string()).optional(),
      decidedBy: z.string().optional().describe('Actor id; default you. Use "operator" when the human made the call.'),
      appendToMission: z.boolean().optional(),
    },
    (a) => agent.recordDecision(a),
  );
}
