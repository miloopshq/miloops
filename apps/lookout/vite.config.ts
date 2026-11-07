import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { BRAND } from '../../packages/core/src/model/brand';
import { trackerFs } from './plugins/trackerFs';

// Dev tracker folder: $<DATA_DIR_ENV>, else <dataDir> at the repo root, the folder `npm run seed` resets and
// `npm run dev:agent` works in, so all three always agree.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = path.resolve(repoRoot, process.env[BRAND.dataDirEnv] || BRAND.dataDir);

export default defineConfig({
  plugins: [react(), trackerFs({ root: dataDir, prefix: BRAND.apiPrefix })],
  server: { port: 5173, host: true },
});
