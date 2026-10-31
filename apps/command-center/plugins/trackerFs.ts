import type { Plugin, ViteDevServer } from 'vite';
import { slackPlugin } from '../../../packages/connector-slack/src/node';
import { createTrackerBridge } from '../../../packages/core/src/bridge';

/** Mounts the tracker file API (shared with the `miloops` CLI) on the Vite dev server. */
export function trackerFs(opts: { root: string; prefix: string }): Plugin {
  return {
    name: 'tracker-fs',
    configureServer(server: ViteDevServer) {
      const url = () => {
        const a = server.resolvedUrls?.local[0];
        return a ? a.replace(/\/?$/, '/') : undefined;
      };
      const bridge = createTrackerBridge(opts.root, { plugins: [slackPlugin()], url });
      server.httpServer?.on('close', () => bridge.close());
      server.middlewares.use(opts.prefix, (req, res) => void bridge.handle(req, res));
    },
  };
}
