import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** `<!-- @include nav -->` pastes partials/nav.html, so the pages share one nav, footer and icon sprite. */
function partials(): Plugin {
  return {
    name: 'partials',
    transformIndexHtml: (html) =>
      html.replace(/<!-- @include (\w+) -->/g, (_, name: string) =>
        readFileSync(resolve(__dirname, 'partials', `${name}.html`), 'utf8'),
      ),
  };
}

export default defineConfig({
  plugins: [partials()],
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
