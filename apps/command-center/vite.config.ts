import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { BRAND } from '../../packages/core/src/model/brand';
import { trackerFs } from './plugins/trackerFs';

// Markdown tracker folder: $<DATA_DIR_ENV>, else <dataDir> in the directory `npm run dev` was invoked from.
const dataDir = path.resolve(process.env.INIT_CWD ?? process.cwd(), process.env[BRAND.dataDirEnv] || BRAND.dataDir);

export default defineConfig({
  plugins: [react(), trackerFs({ root: dataDir, prefix: BRAND.apiPrefix })],
  server: { port: 5173, host: true },
});
