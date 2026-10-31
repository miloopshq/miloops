import { TICKET_TYPES, type TicketType } from '@miloops-hq/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { OperationError, type MissionAgent, type WaitControl } from './agent';

export const ticketType = z.enum(TICKET_TYPES as [TicketType, ...TicketType[]]);
export const mission = z
  .string()
  .optional()
  .describe('Mission id, key (#3) or title. Default: the current mission, else the most recently active one.');
export const ticket = z.string().describe('Ticket key (#12) or id (12).');

type Extra = {
  signal: AbortSignal;
  _meta?: { progressToken?: string | number };
  sendNotification: (n: {
    method: 'notifications/progress';
    params: { progressToken: string | number; progress: number; message?: string };
  }) => Promise<void>;
};

function result(v: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] };
}

function failure(e: unknown) {
  const msg = e instanceof OperationError ? e.message : `${(e as Error).message ?? e}`;
  return { isError: true, content: [{ type: 'text' as const, text: msg }] };
}

export function waitControl(extra: Extra): WaitControl {
  const token = extra._meta?.progressToken;
  return {
    signal: extra.signal,
    onProgress:
      token === undefined
        ? undefined
        : (s) =>
            void extra
              .sendNotification({
                method: 'notifications/progress',
                params: { progressToken: token, progress: s, message: 'Waiting on the human in the command center' },
              })
              .catch(() => {}),
  };
}

/** Registers one tool: its result is JSON text, errors become tool errors, and agent state is flushed after every call. */
export function toolDefiner(server: McpServer, agent: MissionAgent) {
  return <S extends z.ZodRawShape>(
    name: string,
    meta: { title: string; description: string; readOnly?: boolean },
    shape: S,
    fn: (args: z.infer<z.ZodObject<S>>, extra: Extra) => Promise<unknown>,
  ) =>
    server.registerTool(
      name,
      {
        title: meta.title,
        description: meta.description,
        inputSchema: shape,
        annotations: { readOnlyHint: !!meta.readOnly, openWorldHint: false },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (args: any, extra: any) => {
        try {
          agent.noteCall(extra?._meta);
          return result(await fn(args, extra));
        } catch (e) {
          return failure(e);
        } finally {
          agent.flush();
        }
      }) as never,
    );
}

export type DefineTool = ReturnType<typeof toolDefiner>;
