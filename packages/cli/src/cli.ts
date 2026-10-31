import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND } from '@miloops-hq/core';
import { writeCommandCenterLock } from '@miloops-hq/core/agents';
import { createTrackerBridge, type TrackerBridge } from '@miloops-hq/core/bridge';
import { runConnect } from './connect';
import { runMcpServer } from './mcp/server';

declare const __VERSION__: string;

const HELP = `${BRAND.name} — ${BRAND.category}

Usage: ${BRAND.slug} [options]
       ${BRAND.slug} mcp [--dir <path>] [--agent <callsign>]
       ${BRAND.slug} connect claude|codex [--dir <path>]

Starts the command center for the current folder and opens it in your browser.

Commands:
  mcp            Serve the MCP server for coding agents over stdio
                 (claude mcp add ${BRAND.slug} -- npx -y ${BRAND.slug} mcp)
  connect <agent>  Register the MCP server with Claude Code or Codex and add the /milo command

Options:
  --dir <path>   Tracker folder (default: ./${BRAND.dataDir}, or $${BRAND.dataDirEnv})
  --port <n>     Port to listen on (default: 7420; the next free port is used if taken)
  --host <addr>  Interface to bind (default: 127.0.0.1)
  --no-open      Don't open the browser
  -v, --version  Print the version
  -h, --help     Show this help
`;

interface Options {
  dir: string;
  port: number;
  portExplicit: boolean;
  host: string;
  open: boolean;
}

function fail(msg: string): never {
  process.stderr.write(`${BRAND.slug}: ${msg}\nRun \`${BRAND.slug} --help\` for usage.\n`);
  process.exit(2);
}

function parseArgs(argv: string[]): Options {
  const o: Options = {
    dir: process.env[BRAND.dataDirEnv] || BRAND.dataDir,
    port: 7420,
    portExplicit: false,
    host: '127.0.0.1',
    open: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].startsWith('--') && argv[i].includes('=') ? argv[i].split(/=(.*)/s, 2) : [argv[i], undefined];
    const value = () => inline ?? argv[++i] ?? fail(`${flag} needs a value`);
    switch (flag) {
      case '-h':
      case '--help':
        process.stdout.write(HELP);
        process.exit(0);
      case '-v':
      case '--version':
        process.stdout.write(`${__VERSION__}\n`);
        process.exit(0);
      case '--no-open':
        o.open = false;
        break;
      case '--dir':
        o.dir = value();
        break;
      case '--host':
        o.host = value();
        break;
      case '--port': {
        const n = Number(value());
        if (!Number.isInteger(n) || n < 0 || n > 65535) fail(`invalid port: ${argv[i]}`);
        o.port = n;
        o.portExplicit = true;
        break;
      }
      default:
        fail(`unknown option: ${argv[i]}`);
    }
  }
  return o;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function serveStatic(appDir: string, pathname: string, res: http.ServerResponse) {
  let rel = decodeURIComponent(pathname);
  let file = path.join(appDir, path.normalize(rel));
  if (!file.startsWith(appDir + path.sep) || !existsSync(file) || statSync(file).isDirectory()) {
    rel = '/index.html';
    file = path.join(appDir, 'index.html');
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.end(await fs.readFile(file));
}

function listen(server: http.Server, port: number, host: string, retries: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      if (err.code === 'EADDRINUSE' && retries > 0) resolve(listen(server, port + 1, host, retries - 1));
      else reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve((server.address() as { port: number }).port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => process.stdout.write(`  Open ${url} in your browser.\n`));
    child.unref();
  } catch {
    process.stdout.write(`  Open ${url} in your browser.\n`);
  }
}

/** Options of the `mcp` and `connect` subcommands. */
function parseSubArgs(argv: string[], allowed: string[]) {
  const o: { dir: string; agent?: string; rest: string[] } = { dir: process.env[BRAND.dataDirEnv] || BRAND.dataDir, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].startsWith('--') && argv[i].includes('=') ? argv[i].split(/=(.*)/s, 2) : [argv[i], undefined];
    const value = () => inline ?? argv[++i] ?? fail(`${flag} needs a value`);
    if (flag === '-h' || flag === '--help') {
      process.stdout.write(HELP);
      process.exit(0);
    } else if (flag.startsWith('-') && !allowed.includes(flag)) fail(`unknown option: ${argv[i]}`);
    else if (flag === '--dir') o.dir = value();
    else if (flag === '--agent') o.agent = value();
    else o.rest.push(argv[i]);
  }
  return o;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === 'mcp') {
    const o = parseSubArgs(argv.slice(1), ['--dir', '--agent']);
    if (o.rest.length) fail(`unexpected argument: ${o.rest[0]}`);
    await runMcpServer({ root: path.resolve(process.cwd(), o.dir), agent: o.agent, version: __VERSION__ });
    return;
  }
  if (argv[0] === 'connect') {
    const o = parseSubArgs(argv.slice(1), ['--dir']);
    const target = o.rest[0];
    if (target !== 'claude' && target !== 'codex') fail('connect needs an agent: claude or codex');
    process.stdout.write(`\n  ${BRAND.name} · connect ${target === 'claude' ? 'Claude Code' : 'Codex'}\n\n`);
    runConnect(target, { cwd: process.cwd(), dir: o.dir });
    process.stdout.write('\n');
    return;
  }
  const opts = parseArgs(argv);
  const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'app');
  if (!existsSync(path.join(appDir, 'index.html'))) fail(`command center bundle missing at ${appDir}; reinstall the package`);

  let bridge: TrackerBridge | undefined;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (bridge && (url.pathname === BRAND.apiPrefix || url.pathname.startsWith(`${BRAND.apiPrefix}/`))) {
      req.url = req.url!.slice(BRAND.apiPrefix.length) || '/';
      void bridge.handle(req, res);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.end();
      return;
    }
    serveStatic(appDir, url.pathname, res).catch((err) => {
      res.statusCode = 500;
      res.end(String(err));
    });
  });

  let port: number;
  try {
    port = await listen(server, opts.port, opts.host, opts.portExplicit ? 0 : 20);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    fail(e.code === 'EADDRINUSE' ? `port ${opts.port} is already in use; pick another with --port <n>` : e.message);
  }
  bridge = createTrackerBridge(path.resolve(process.cwd(), opts.dir));
  const shownHost = opts.host === '127.0.0.1' || opts.host === '0.0.0.0' ? 'localhost' : opts.host;
  const url = `http://${shownHost}:${port}/`;
  process.stdout.write(
    `\n  ${BRAND.name} ${__VERSION__} · ${BRAND.assistant.name} online\n\n` +
      `  Command center  ${url}\n` +
      `  Tracker         ${path.relative(process.cwd(), bridge.root) || '.'}${path.sep}  (${bridge.root})\n\n` +
      `  Press Ctrl+C to stop.\n\n`,
  );
  if (opts.open) openBrowser(url);
  const unlock = writeCommandCenterLock(bridge.root, url);

  const stop = () => {
    unlock();
    bridge?.close();
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

void main();
