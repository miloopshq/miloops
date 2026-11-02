import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import type * as Waitlist from './api/waitlist';

/** `<!-- @include nav -->` pastes partials/nav.html, so the pages share one nav, footer and icon sprite. */
function partials(): Plugin {
  return {
    name: 'partials',
    transformIndexHtml: (html) =>
      html
        .replaceAll('%SITE_URL%', SITE_URL)
        .replace(/<!-- @include (\w+) -->/g, (_, name: string) =>
          readFileSync(resolve(__dirname, 'partials', `${name}.html`), 'utf8'),
        ),
  };
}

/**
 * Absolute base for share cards (og:image must be an absolute URL): $SITE_URL, else the production URL Vercel
 * provides at build time, else the current production address. Switch it to https://miloops.app once that
 * domain points at Vercel (or set SITE_URL in the Vercel project).
 */
const SITE_URL = (
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://miloops-landing.vercel.app')
).replace(/\/$/, '');

/** Serves api/waitlist.ts in `vite dev` the way Vercel does in production, with env from .env.local. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      Object.assign(process.env, loadEnv('development', __dirname, 'RESEND_'));
      server.middlewares.use('/api/waitlist', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const { POST } = (await server.ssrLoadModule('/api/waitlist.ts')) as typeof Waitlist;
        const r = await POST(
          new Request('http://localhost/api/waitlist', { method: 'POST', body: Buffer.concat(chunks) }),
        );
        res.statusCode = r.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(await r.text());
      });
    },
  };
}

export default defineConfig({
  plugins: [partials(), devApi()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        features: resolve(__dirname, 'features/index.html'),
        specialists: resolve(__dirname, 'specialists/index.html'),
      },
    },
  },
});
