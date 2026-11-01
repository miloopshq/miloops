// A real MILOOPS project for the capture scripts, set up the way a user has one: the dev seed written into a
// temp folder, the built `miloops` server serving it, and real MCP agents (scripts/dev-agent.mjs) working it.
// Needs: npm run build -w miloops.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const cli = path.join(repo, 'packages/cli/dist/cli.js');

/** Seeds a temp project, starts the server and `agents` MCP agents; `stop()` ends them and deletes the folder. */
export async function realProject({ agents = 2 } = {}) {
  if (!fs.existsSync(cli)) throw new Error('build the CLI first: npm run build -w miloops');
  // The folder name shows as the project name in the header.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'miloops-capture-'));
  const dir = path.join(tmp, 'fieldnote-app');
  fs.mkdirSync(dir);
  const data = path.join(dir, '.miloops');
  const env = { ...process.env, MILOOPS_DIR: data };
  execFileSync('npm', ['run', '--silent', 'seed'], { cwd: repo, env, stdio: 'ignore' });

  const server = spawn(process.execPath, [cli, '--no-open', '--port', '0', '--dir', data], { cwd: dir, env });
  const url = await new Promise((resolve, reject) => {
    let out = '';
    server.stdout.on('data', (c) => {
      out += c;
      const m = out.match(/Command center\s+(http:\S+)/);
      if (m) resolve(m[1]);
    });
    server.on('exit', (code) => reject(new Error(`miloops exited ${code}: ${out}`)));
  });

  const crew = spawn(process.execPath, [path.join(repo, 'scripts/dev-agent.mjs'), String(agents)], { cwd: repo, env });
  let log = '';
  crew.stdout.on('data', (c) => (log += c));
  crew.stderr.on('data', (c) => (log += c));

  return {
    url,
    /** Agent output so far, for waiting on a step ("asking:", "closed #7"). */
    agentLog: () => log,
    stop() {
      crew.kill();
      server.kill();
      try {
        fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        // the server may still be flushing; the OS cleans temp folders
      }
    },
  };
}
