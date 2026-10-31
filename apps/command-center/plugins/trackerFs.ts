import type { Plugin, ViteDevServer } from 'vite';
import { createTrackerBridge } from '../../../packages/core/src/bridge';

/** Mounts the tracker file API (shared with the `miloops` CLI) on the Vite dev server. */
export function trackerFs(opts: { root: string; prefix: string }): Plugin {
  return {
    name: 'tracker-fs',
    configureServer(server: ViteDevServer) {
      const bridge = createTrackerBridge(opts.root);
      server.httpServer?.on('close', () => bridge.close());
      server.middlewares.use(opts.prefix, (req, res) => void bridge.handle(req, res));
    },
  };
}
