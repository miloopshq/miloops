// Bundles the CLI into dist/cli.js (no runtime dependencies) and copies the prebuilt command center into dist/app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, 'dist');
const appDist = path.resolve(here, '../../apps/command-center/dist');
const { version } = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));

if (!fs.existsSync(path.join(appDist, 'index.html')))
  throw new Error(`run the command-center build first (${appDist} missing)`);
fs.rmSync(dist, { recursive: true, force: true });

await build({
  entryPoints: [path.join(here, 'src/cli.ts')],
  outfile: path.join(dist, 'cli.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  define: { __VERSION__: JSON.stringify(version) },
  loader: { '.md': 'text' },
  logLevel: 'warning',
});
fs.chmodSync(path.join(dist, 'cli.js'), 0o755);
fs.cpSync(appDist, path.join(dist, 'app'), { recursive: true });
fs.copyFileSync(path.resolve(here, '../../THIRD_PARTY_NOTICES.md'), path.join(here, 'THIRD_PARTY_NOTICES.md'));
fs.copyFileSync(path.resolve(here, '../../LICENSE'), path.join(here, 'LICENSE'));
console.log(`built miloops ${version} → ${path.relative(process.cwd(), dist)}`);
