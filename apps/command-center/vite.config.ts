import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { BRAND } from '../../packages/core/src/brand';
import { trackerFs } from './plugins/trackerFs';

// Markdown tracker folder: $<DATA_DIR_ENV>, else <dataDir> in the directory `npm run dev` was invoked from.
const dataDir = path.resolve(process.env.INIT_CWD ?? process.cwd(), process.env[BRAND.dataDirEnv] || BRAND.dataDir);

export default defineConfig({
  plugins: [react(), trackerFs({ root: dataDir, prefix: BRAND.apiPrefix })],
  server: { port: 5173, host: true },
});
