import { CRITERION_KINDS, type CriterionKind } from '@miloops-hq/core';
import { z } from 'zod';
import type { MissionAgent } from '../agent';
import { type DefineTool, mission, ticketType } from '../toolKit';

/** Mission tools: status, start, resume and edit a mission. */
export function registerMissionTools(tool: DefineTool, agent: MissionAgent) {
  tool(
    'status',
    {
      title: 'Mission status',
      description:
        'Progress, ready/claimed/blocked tickets, running sessions, questions waiting on the human, recent decisions and spend. Also lists every mission.',
      readOnly: true,
    },
    { mission },
    (a) => agent.status(a.mission),
  );

  tool(
    'start_mission',
    {
      title: 'Start a mission',
      description:
        'Create a mission from a framed idea: destination (what done looks like), notes, decisions already made, open questions (not yet specified), out of scope, and the first tickets with blocking edges (by ref). Frame it first: ask the framing questions with ask_human (framing: true).',
    },
    {
      title: z.string().min(1).describe('Short mission title.'),
      destination: z.string().min(1).describe('What "done" looks like.'),
      notes: z.string().optional(),
      mode: z.enum(['plan+execute', 'plan-only']).optional().describe('plan-only disables execute tickets.'),
      decided: z.array(z.string()).optional().describe('Decisions already made, one line each.'),
      unspecified: z.array(z.string()).optional().describe('Known unknowns, kept under Not yet specified.'),
      outOfScope: z.array(z.string()).optional(),
      tickets: z
        .array(
          z.object({
            ref: z.string().describe('Local ref used by blockedBy, e.g. "auth".'),
            title: z.string(),
            type: ticketType,
            body: z.string().optional(),
            hitl: z.boolean().optional().describe('task/execute only: needs the human.'),
            blockedBy: z.array(z.string()).optional().describe('Refs of tickets that must close first.'),
            criteria: z
              .array(
                z.object({
                  text: z.string().min(1),
                  kind: z.enum(CRITERION_KINDS as [CriterionKind, ...CriterionKind[]]),
                  source: z.string().optional(),
                }),
              )
              .optional()
              .describe('Acceptance criteria for implementation tickets: what must be true for it to be done.'),
          }),
        )
        .optional(),
      discovery: z
        .boolean()
        .optional()
        .describe(
          'Default true: the mission starts with a discovery ticket, and implementation tickets wait until the human accepts your discovery brief. Set false only when the human says to skip discovery.',
        ),
    },
    (a) => agent.startMission(a),
  );

  tool(
    'resume_mission',
    {
      title: 'Resume a mission',
      description:
        'Pick up a mission: opens a session, returns status, any ticket you still hold and the next ready ticket.',
    },
    { mission },
    (a) => agent.resumeMission(a.mission),
  );

  tool(
    'update_mission',
    {
      title: 'Update mission',
      description: 'Edit the destination or notes, add Not yet specified or Out of scope lines, or switch mode.',
    },
    {
      mission,
      destination: z.string().optional(),
      notes: z.string().optional(),
      addUnspecified: z.array(z.string()).optional(),
      addOutOfScope: z.array(z.string()).optional(),
      mode: z.enum(['plan+execute', 'plan-only']).optional(),
    },
    (a) => agent.updateMission(a),
  );

  tool(
    'submit_brief',
    {
      title: 'Submit the discovery brief',
      description:
        'Before implementation: what you found about the existing system, for the human to review. Cite real paths; never guess. Implementation tickets (task, execute, prototype) can be claimed once the human accepts it.',
    },
    {
      mission,
      summary: z.string().min(1).describe('What this mission changes, in a few lines.'),
      productContext: z
        .string()
        .optional()
        .describe('Who it affects, business rules and UX principles that apply, plan or pricing constraints.'),
      existing: z.string().min(1).describe('Files, services and modules involved, each with its path and one line.'),
      conventions: z.string().optional().describe('Conventions and abstractions to follow.'),
      dataModel: z.string().optional().describe('Data model impact.'),
      api: z.string().optional().describe('API impact.'),
      risks: z.string().optional().describe('Risks and possible regressions.'),
      assumptions: z.array(z.string()).optional().describe('Assumptions you rely on, one each.'),
      openQuestions: z.array(z.string()).optional(),
    },
    (a) => agent.submitBrief(a),
  );

  tool(
    'get_brief',
    {
      title: 'Read the discovery brief',
      description: "The mission's discovery brief, its status and any change request.",
      readOnly: true,
    },
    { mission },
    (a) => agent.getBrief(a),
  );
}
