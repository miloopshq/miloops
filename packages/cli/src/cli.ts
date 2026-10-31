import path from 'node:path';
import { BRAND } from '@miloops-hq/core';
import { fail } from './args/help';
import { parseArgs, parseSubArgs } from './args/parseArgs';
import { runConnect } from './connect';
import { runMcpServer } from './mcp/server';
import { serveCommandCenter } from './serve/serveCommandCenter';
import { readStdin, recordClaudeSession } from './usage/hook';

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === 'mcp') {
    const o = parseSubArgs(argv.slice(1), ['--dir', '--agent', '--lease-minutes']);
    if (o.rest.length) fail(`unexpected argument: ${o.rest[0]}`);
    await runMcpServer({
      root: path.resolve(process.cwd(), o.dir),
      agent: o.agent,
      leaseMinutes: o.leaseMinutes,
      version: __VERSION__,
    });
    return;
  }
  if (argv[0] === 'hook') {
    const o = parseSubArgs(argv.slice(1), ['--dir']);
    if (o.rest[0] !== 'claude') fail('hook needs an agent: claude');
    try {
      recordClaudeSession(await readStdin(), { dir: o.dir });
    } catch {
      // a hook must never break the agent's session
    }
    return;
  }
  const slackSetup = argv[0] === 'connect' && argv[1] === 'slack';
  if (argv[0] === 'connect' && !slackSetup) {
    const o = parseSubArgs(argv.slice(1), ['--dir']);
    const target = o.rest[0];
    if (target !== 'claude' && target !== 'codex') fail('connect needs an agent: claude or codex');
    process.stdout.write(`\n  ${BRAND.name} · connect ${target === 'claude' ? 'Claude Code' : 'Codex'}\n\n`);
    runConnect(target, { cwd: process.cwd(), dir: o.dir });
    process.stdout.write('\n');
    return;
  }
  await serveCommandCenter(parseArgs(slackSetup ? argv.slice(2) : argv), slackSetup);
}

void main();
