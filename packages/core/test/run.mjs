// Bundles the TypeScript tests with esbuild and runs them with `node --test`.
//   node test/run.mjs                 run every *.test.ts
//   node test/run.mjs record [fake|live]   re-record fixtures (see record.ts)
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../../node_modules/.cache/miloops-core-tests');
const [cmd, ...rest] = process.argv.slice(2);
const entries = cmd === 'record' ? ['record.ts'] : readdirSync(here).filter((f) => f.endsWith('.test.ts') && (!cmd || f.includes(cmd)));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
await build({
  entryPoints: entries.map((f) => path.join(here, f)),
  outdir: out,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: 'inline',
  packages: 'external',
  define: { __FIXTURES__: JSON.stringify(path.join(here, 'fixtures')) },
  logLevel: 'warning',
});

const files = entries.map((f) => path.join(out, f.replace(/\.ts$/, '.mjs')));
const args = cmd === 'record' ? [files[0], ...rest] : ['--test', '--enable-source-maps', ...files];
const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(r.status ?? 1);
