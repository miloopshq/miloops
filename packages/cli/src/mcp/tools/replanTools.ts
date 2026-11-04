import { DESTINATION_REASONS, type DestinationReason } from '@miloops-hq/core';
import { z } from 'zod';
import type { MissionAgent } from '../agent';
import { challengeAssumptionOp, listAssumptions } from '../mission/assumptions';
import { proposeReplanOp, replanStatus } from '../mission/replans';
import { type DefineTool, mission, ticket, ticketType, waitControl } from '../toolKit';

const ref = z.string().min(1);
const text = z.string().min(1);

/** One typed change to the map. Tickets by key (#12) or id; tickets this proposal adds by their `ref`. */
const change = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_ticket'),
    ref: ref.describe('Local name other changes can use, e.g. "batch-fallback".'),
    title: text,
    type: ticketType,
    body: z.string().optional(),
    hitl: z.boolean().optional(),
    blockedBy: z.array(ref).optional(),
  }),
  z.object({ op: z.literal('cancel_ticket'), ticket: ref, reason: text }),
  z.object({
    op: z.literal('edit_ticket'),
    ticket: ref,
    title: z.string().optional().describe('The new title.'),
    body: z.string().optional().describe('The new description; it replaces the old one.'),
  }),
  z.object({
    op: z.literal('rewire'),
    ticket: ref,
    addBlockedBy: z.array(ref).optional().describe('Tickets it must now wait for.'),
    removeBlockedBy: z.array(ref).optional().describe('Current blockers it no longer waits for.'),
  }),
  z.object({ op: z.literal('supersede_decision'), decision: ref.describe('D-<n>'), answer: text, rationale: text }),
  z.object({ op: z.literal('update_destination'), text }),
  z.object({ op: z.literal('add_unspecified'), text }),
  z.object({ op: z.literal('add_out_of_scope'), text }),
  z.object({ op: z.literal('reopen'), ticket: ref, reason: text }),
]);

/** Adaptive missions: assumptions, challenges and replan proposals the human approves. */
export function registerReplanTools(tool: DefineTool, agent: MissionAgent) {
  tool(
    'list_assumptions',
    {
      title: 'List assumptions',
      description:
        "The mission's assumptions (S-<n>), their status (holding, challenged, invalidated, confirmed), and the tickets and decisions that depend on each.",
      readOnly: true,
    },
    { mission },
    (a) => agent.with(listAssumptions, a),
  );

  tool(
    'challenge_assumption',
    {
      title: 'Challenge an assumption',
      description:
        'You found evidence that an assumption does not hold. Marks it challenged and returns what depends on it. Then propose_replan; do not silently work around it.',
    },
    {
      mission,
      assumption: ref.describe('S-<n>'),
      evidence: text.describe('What you found: paths, output, docs. Never a guess.'),
      ticket: ticket.optional().describe('Where the finding came up; default your current ticket.'),
    },
    (a) => agent.with(challengeAssumptionOp, a),
  );

  tool(
    'propose_replan',
    {
      title: 'Propose a replan',
      description:
        'Propose typed changes to the map for the human to approve. Nothing changes until they do; the tickets it cancels, edits or rewires are frozen meanwhile. kind "challenge-destination" says the destination itself is wrong (the work exists already, it targets the wrong problem, or it should be rescoped) and needs an update_destination change. A newer proposal of yours replaces your pending one.',
    },
    {
      mission,
      kind: z.enum(['replan', 'challenge-destination']).optional().describe('Default replan.'),
      destinationReason: z
        .enum(DESTINATION_REASONS as [DestinationReason, ...DestinationReason[]])
        .optional()
        .describe('challenge-destination only.'),
      reason: text.describe('Why the plan should change, in a few lines.'),
      evidence: text.describe('What you found, with paths or output.'),
      invalidates: z.array(ref).optional().describe('Assumptions (S-<n>) the evidence shows are wrong.'),
      changes: z.array(change).min(1),
    },
    (a) => agent.with(proposeReplanOp, a),
  );

  tool(
    'replan_status',
    {
      title: 'Replan status',
      description:
        "A proposal's decision: pending, approved (applied), rejected (with the human's note) or superseded. Default: your latest proposal on the mission. wait: true blocks until the human decides.",
      readOnly: true,
    },
    {
      mission,
      id: z.string().optional().describe('R-<n>; default your latest.'),
      wait: z.boolean().optional(),
      waitSeconds: z
        .number()
        .int()
        .min(0)
        .max(3600)
        .optional()
        .describe('With wait: how long (default 600; 50 for Codex).'),
    },
    (a, extra) =>
      agent.with(
        (ctx, input: typeof a) =>
          replanStatus(
            ctx,
            input,
            agent.defaultWaitSeconds(),
            waitControl(extra, 'Waiting for the human to decide the replan'),
          ),
        a,
      ),
  );
}
