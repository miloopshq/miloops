// Resets the local development tracker to a fixed, known project, so working on MILOOPS looks like real use.
// It writes plain files through the same adapters a real install uses: missions, tickets, decisions and
// verification config. Live agents come from `npm run dev:agent`, a real MCP client.
// Run: npm run seed   (folder: $<DATA_DIR_ENV>, else <dataDir> at the repo root)
// Safety: only a folder this script created (it holds DEV_MARKER) is wiped; anything else is refused.
import fs from 'node:fs';
import path from 'node:path';
import { BRAND, MarkdownAdapter, seedSnapshot, setMapMode } from '@miloops-hq/core';
import { nodeMarkdownFs } from '@miloops-hq/core/node';

const DEV_MARKER = '.dev-seed';
// Bundled to node_modules/.cache before it runs, so the repo root comes from npm, not from the file's path.
const repoRoot = process.env.npm_config_local_prefix ?? process.cwd();
const root = path.resolve(repoRoot, process.env[BRAND.dataDirEnv] || BRAND.dataDir);

if (fs.existsSync(root)) {
  const owned = fs.existsSync(path.join(root, DEV_MARKER));
  const empty = fs.readdirSync(root).length === 0;
  if (!owned && !empty) {
    console.error(`${root} exists and was not created by the dev seed; refusing to wipe it.`);
    console.error(`Point ${BRAND.dataDirEnv} at another folder, or delete it yourself if it is disposable.`);
    process.exit(1);
  }
  fs.rmSync(root, { recursive: true, force: true });
}
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(
  path.join(root, DEV_MARKER),
  'Created by npm run seed. Reset on every seed; do not keep real work here.\n',
);

// The repo's checks, as a team would commit them: verification runs real commands on completion.
fs.writeFileSync(
  path.join(root, 'verification.json'),
  `${JSON.stringify(
    {
      v: 1,
      default: 'checks',
      checks: {
        typecheck: { run: ['npm', 'run', 'typecheck'], timeoutSec: 300 },
        test: { run: ['npm', 'test'], timeoutSec: 600 },
      },
      run: ['typecheck', 'test'],
    },
    null,
    2,
  )}\n`,
);

const adapter = new MarkdownAdapter(nodeMarkdownFs(root), root);

// 1. A mission mid-flight: decisions made and superseded, work done, blocked, ruled out of scope.
const main = await seedSnapshot(adapter);

// 2. A second, plan-only mission, so the switcher and cross-mission views have something to show.
const second = await adapter.createMap({
  title: 'Team workspaces',
  mode: 'plan-only',
  sections: {
    destination: 'Teams share notebooks with roles, and admins manage members without contacting support.',
    notes: 'Admins asked for this in the Q3 survey. Must work with existing SSO.',
    decisions: [],
    unspecified: ['Audit log of membership changes'],
    outOfScope: ['Billing changes'],
  },
});
const who = await adapter.createTicket(second.id, {
  title: 'Who is the primary user of team workspaces?',
  type: 'grilling',
  hitl: true,
  body: '',
});
const prior = await adapter.createTicket(second.id, {
  title: 'Prior art for team workspaces',
  type: 'research',
  hitl: false,
  body: '',
});
const roles = await adapter.createTicket(second.id, {
  title: 'Which roles do we ship first?',
  type: 'grilling',
  hitl: true,
  body: '',
});
await adapter.addBlocking(second.id, who.id, roles.id);
await adapter.addBlocking(second.id, prior.id, roles.id);
await setMapMode(adapter, second.id, 'plan-only');

console.log(`seeded ${root}`);
console.log(`  ${main.key} ${main.title} · mid-flight`);
console.log(`  ${second.key} ${second.title} · plan only`);
console.log('Live agents: npm run dev:agent (needs npm run build -w miloops once).');
process.exit(0);
