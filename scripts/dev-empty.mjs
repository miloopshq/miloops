// `npm run dev:empty`: the command center on a brand-new, empty tracker folder, to try the first-run flow
// (no missions, empty zones, Create mission). Each run starts from zero; open it in a private window to see
// onboarding too. The folder is printed so you can look inside.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miloops-empty-'));
console.log(`\n  Empty tracker folder: ${dir}\n  (open it with: open ${dir})\n`);
const child = spawn('npm', ['run', 'dev:keep'], { stdio: 'inherit', env: { ...process.env, MILOOPS_DIR: dir } });
child.on('exit', (code) => process.exit(code ?? 0));
