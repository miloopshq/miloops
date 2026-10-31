import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BRAND } from '@miloops-hq/core';
import MILO_COMMAND from '../commands/milo.md';

export type ConnectTarget = 'claude' | 'codex';

const has = (bin: string) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' }).status === 0;

function writeIfChanged(file: string, text: string) {
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
  if (prev === text) return 'unchanged';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return prev === undefined ? 'added' : 'updated';
}

/** The command an agent runs to start the server; `--dir` only when the tracker folder is not the default. */
export function serverArgs(dir?: string) {
  return ['-y', BRAND.slug, 'mcp', ...(dir && dir !== BRAND.dataDir ? ['--dir', dir] : [])];
}

/** `miloops connect claude|codex`: register the MCP server with the agent and install the `/milo` command. */
export function runConnect(target: ConnectTarget, opts: { cwd: string; dir?: string; print?: (s: string) => void }) {
  const print = opts.print ?? ((s: string) => process.stdout.write(`${s}\n`));
  const args = serverArgs(opts.dir);
  const quoted = ['npx', ...args].join(' ');
  if (target === 'claude') {
    const file = path.join(opts.cwd, '.claude', 'commands', 'milo.md');
    print(`  /milo command   ${writeIfChanged(file, MILO_COMMAND)} · ${path.relative(opts.cwd, file)}`);
    const add = ['mcp', 'add', BRAND.slug, '--', 'npx', ...args];
    if (has('claude')) {
      const r = spawnSync('claude', add, { cwd: opts.cwd, encoding: 'utf8' });
      const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
      if (r.status === 0) print(`  MCP server      registered · claude mcp add ${BRAND.slug} -- ${quoted}`);
      else if (/already exists/i.test(out)) print(`  MCP server      already registered`);
      else print(`  MCP server      not registered (${out || `exit ${r.status}`}). Run: claude mcp add ${BRAND.slug} -- ${quoted}`);
    } else print(`  MCP server      Claude Code not found on PATH. Run: claude mcp add ${BRAND.slug} -- ${quoted}`);
    print(`\n  In Claude Code: /milo new "<idea>", /milo resume, /milo status, /milo inbox`);
    return;
  }
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const file = path.join(home, 'prompts', 'milo.md');
  print(`  /milo prompt    ${writeIfChanged(file, MILO_COMMAND)} · ${file}`);
  if (has('codex')) {
    const r = spawnSync('codex', ['mcp', 'add', BRAND.slug, '--', 'npx', ...args], { cwd: opts.cwd, encoding: 'utf8' });
    print(r.status === 0 ? `  MCP server      registered · codex mcp add ${BRAND.slug} -- ${quoted}` : `  MCP server      not registered. Add it to ${path.join(home, 'config.toml')} (below).`);
  } else print(`  MCP server      Codex not found on PATH. Add this to ${path.join(home, 'config.toml')}:`);
  print(`\n  [mcp_servers.${BRAND.slug}]\n  command = "npx"\n  args = [${args.map((a) => JSON.stringify(a)).join(', ')}]\n  tool_timeout_sec = 900`);
  print(`\n  In Codex: /prompts:milo new "<idea>", /prompts:milo resume, /prompts:milo status, /prompts:milo inbox`);
}
