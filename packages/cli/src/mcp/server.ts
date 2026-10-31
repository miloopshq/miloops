import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BRAND, TICKET_TYPES, type TicketType } from '@miloops-hq/core';
import { MissionAgent, OperationError, type WaitControl } from './agent';

const INSTRUCTIONS = `${BRAND.name} is the command center for this repo's missions. A mission is a map of tickets (research, prototype, grilling, task, execute) with blocking edges; the human watches it live in the command center and answers questions there.

Work loop: resume_mission (or start_mission for a new idea) → claim_ticket → do the work, calling report_progress with steps, notes and token/cost usage → ask_human whenever you need the human (it waits for the answer) → close_ticket with the resolution → claim the next ticket.
Use record_decision for any other call worth keeping. Never decide HITL tickets (grilling, prototype, HITL tasks) alone: ask.
If ask_human returns answered=false, call wait_for_answer with the questionId, or tell the user the question is waiting in the command center.`;

const ticketType = z.enum(TICKET_TYPES as [TicketType, ...TicketType[]]);
const mission = z.string().optional().describe('Mission id, key (#3) or title. Default: the current mission, else the most recently active one.');
const ticket = z.string().describe('Ticket key (#12) or id (12).');

type Extra = { signal: AbortSignal; _meta?: { progressToken?: string | number }; sendNotification: (n: { method: 'notifications/progress'; params: { progressToken: string | number; progress: number; message?: string } }) => Promise<void> };

function result(v: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] };
}

function failure(e: unknown) {
  const msg = e instanceof OperationError ? e.message : `${(e as Error).message ?? e}`;
  return { isError: true, content: [{ type: 'text' as const, text: msg }] };
}

function waitControl(extra: Extra): WaitControl {
  const token = extra._meta?.progressToken;
  return {
    signal: extra.signal,
    onProgress: token === undefined ? undefined : (s) => void extra.sendNotification({ method: 'notifications/progress', params: { progressToken: token, progress: s, message: 'Waiting on the human in the command center' } }).catch(() => {}),
  };
}

export function createMcpServer(agent: MissionAgent, version: string) {
  const server = new McpServer({ name: BRAND.slug, title: BRAND.name, version }, { instructions: INSTRUCTIONS });
  const tool = <S extends z.ZodRawShape>(
    name: string,
    meta: { title: string; description: string; readOnly?: boolean },
    shape: S,
    fn: (args: z.infer<z.ZodObject<S>>, extra: Extra) => Promise<unknown>,
  ) =>
    server.registerTool(
      name,
      { title: meta.title, description: meta.description, inputSchema: shape, annotations: { readOnlyHint: !!meta.readOnly, openWorldHint: false } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (args: any, extra: any) => {
        try {
          return result(await fn(args, extra));
        } catch (e) {
          return failure(e);
        } finally {
          agent.flush();
        }
      }) as never,
    );

  tool('status', { title: 'Mission status', description: 'Progress, ready/claimed/blocked tickets, running sessions, questions waiting on the human, recent decisions and spend. Also lists every mission.', readOnly: true }, { mission }, (a) =>
    agent.status(a.mission),
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
          }),
        )
        .optional(),
    },
    (a) => agent.startMission(a),
  );

  tool('resume_mission', { title: 'Resume a mission', description: 'Pick up a mission: opens a session, returns status, any ticket you still hold and the next ready ticket.' }, { mission }, (a) =>
    agent.resumeMission(a.mission),
  );

  tool(
    'update_mission',
    { title: 'Update mission', description: 'Edit the destination or notes, add Not yet specified or Out of scope lines, or switch mode.' },
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
    'next_ticket',
    { title: 'Next ready ticket', description: 'The oldest open, unblocked, unclaimed ticket, with its body, blockers and the decisions they produced. Does not claim it.', readOnly: true },
    { mission, types: z.array(ticketType).optional() },
    (a) => agent.nextTicket(a),
  );

  tool('claim_ticket', { title: 'Claim a ticket', description: 'Assign a ticket to you (default: the next ready one) and start working it. Fails if another agent got it first.' }, { mission, ticket: ticket.optional() }, (a) =>
    agent.claimTicket(a),
  );

  tool('release_ticket', { title: 'Release a ticket', description: 'Give a claimed ticket back to the frontier without closing it.' }, { mission, ticket: ticket.optional(), reason: z.string().optional() }, (a) =>
    agent.releaseTicket(a),
  );

  tool(
    'add_ticket',
    { title: 'Add a ticket', description: 'Add a ticket to the mission, optionally blocked by existing tickets, or promote a Not yet specified line (fromUnspecified).' },
    { mission, title: z.string().min(1), type: ticketType, body: z.string().optional(), hitl: z.boolean().optional(), blockedBy: z.array(z.string()).optional(), fromUnspecified: z.string().optional() },
    (a) => agent.addTicket(a),
  );

  tool(
    'report_progress',
    {
      title: 'Report progress',
      description:
        'Show progress live in the command center: a step of the session procedure (work: Load mission, Claim, Resolve, Record, Update plan; research: Claim, Investigate, Record), a log line, a chat message to the human, and model usage since your last report (tokens and USD).',
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
      summary: z.string().optional().describe('One line for the Decisions list. Default: first sentence of the resolution.'),
      rationale: z.string().optional(),
      alternatives: z.array(z.string()).optional(),
      outcome: z.enum(['completed', 'out_of_scope']).optional(),
      postTranscript: z.boolean().optional().describe('Also post the question/answer transcript as a ticket comment.'),
    },
    (a) => agent.closeTicket(a),
  );

  tool(
    'record_decision',
    { title: 'Record a decision', description: 'Keep a DecisionRecord (question, answer, rationale, alternatives, who decided) and add it to the mission Decisions, without closing a ticket.' },
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

  tool(
    'ask_human',
    {
      title: 'Ask the human',
      description:
        'Ask the human a question. It lands in the command center inbox (Waiting on you) and this call waits for the answer, up to waitSeconds (default 600; 50 for Codex). Returns answered=false with a questionId on timeout: call wait_for_answer to keep waiting. Set framing=true for the framing questions of a mission that does not exist yet.',
    },
    {
      question: z.string().min(1),
      suggestions: z.array(z.string()).optional().describe('Suggested replies, shown as one-click answers.'),
      waitSeconds: z.number().int().min(0).max(86_400).optional(),
      framing: z.boolean().optional(),
    },
    (a, extra) => agent.ask(a, waitControl(extra)),
  );

  tool(
    'wait_for_answer',
    { title: 'Wait for an answer', description: 'Keep waiting for the answer to a question asked with ask_human.', readOnly: true },
    { questionId: z.string(), waitSeconds: z.number().int().min(0).max(86_400).optional() },
    (a, extra) => agent.waitForAnswer(a, waitControl(extra)),
  );

  tool('list_inbox', { title: 'Inbox', description: 'Questions from every connected agent that are waiting on the human, oldest first.', readOnly: true }, {}, () => agent.inbox());

  tool(
    'answer_question',
    { title: 'Answer a question', description: "Answer a waiting question on the human's behalf, with the human's own words from this chat. Only use text the human gave you." },
    { questionId: z.string(), answer: z.string().min(1) },
    (a) => agent.answerQuestion(a),
  );

  return server;
}

/** `miloops mcp`: serve the agent over stdio until the client disconnects. */
export async function runMcpServer(opts: { root: string; agent?: string; version: string }) {
  let server: McpServer | undefined;
  const client = () => {
    const v = server?.server.getClientVersion();
    return v ? `${v.name} ${v.version}` : undefined;
  };
  const agent = new MissionAgent({ root: opts.root, agent: opts.agent, client });
  server = createMcpServer(agent, opts.version);
  let closed = false;
  const shutdown = (code = 0) => {
    if (closed) return;
    closed = true;
    agent.close();
    void server!.close().finally(() => process.exit(code));
  };
  const transport = new StdioServerTransport();
  transport.onclose = () => shutdown();
  process.stdin.on('end', () => shutdown());
  process.on('SIGINT', () => shutdown());
  process.on('SIGTERM', () => shutdown());
  await server.connect(transport);
  process.stderr.write(`${BRAND.slug} mcp · tracker ${opts.root}\n`);
}
