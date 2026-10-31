import { BRAND, MarkdownAdapter } from '@miloops-hq/core';
import { activeTracker } from '@miloops-hq/core/bridge';
import { nodeMarkdownFs } from '@miloops-hq/core/node';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { UsageMeter } from '../usage/meter';
import { MissionAgent } from './agent';
import { INSTRUCTIONS } from './instructions';
import { toolDefiner } from './toolKit';
import { registerHitlTools } from './tools/hitlTools';
import { registerMissionTools } from './tools/missionTools';
import { registerTicketTools } from './tools/ticketTools';
import { registerWorkTools } from './tools/workTools';

export function createMcpServer(agent: MissionAgent, version: string) {
  const server = new McpServer({ name: BRAND.slug, title: BRAND.name, version }, { instructions: INSTRUCTIONS });
  const tool = toolDefiner(server, agent);
  registerMissionTools(tool, agent);
  registerTicketTools(tool, agent);
  registerWorkTools(tool, agent);
  registerHitlTools(tool, agent);
  return server;
}

/** `miloops mcp`: serve the agent over stdio until the client disconnects. */
export async function runMcpServer(opts: { root: string; agent?: string; version: string }) {
  let server: McpServer | undefined;
  const client = () => {
    const v = server?.server.getClientVersion();
    return v ? `${v.name} ${v.version}` : undefined;
  };
  const markdown = new MarkdownAdapter({ ...nodeMarkdownFs(opts.root), watch: undefined }, opts.root);
  const agent = new MissionAgent({
    root: opts.root,
    agent: opts.agent,
    client,
    tracker: activeTracker({ root: opts.root, markdown }),
    usage: new UsageMeter({ root: opts.root }),
  });
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
