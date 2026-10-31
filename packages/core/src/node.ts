import fs from 'node:fs/promises';
import { mkdirSync, watch } from 'node:fs';
import path from 'node:path';
import type { MarkdownFs } from './adapters/markdown';

/** node:fs-backed MarkdownFs, for a CLI / MCP server running next to the repo. */
export function nodeMarkdownFs(root: string): MarkdownFs {
  const abs = path.resolve(root);
  mkdirSync(abs, { recursive: true });
  const safe = (p: string) => {
    const full = path.resolve(abs, p);
    if (full !== abs && !full.startsWith(abs + path.sep)) throw new Error('path escapes root');
    return full;
  };
  async function walk(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const out: string[] = [];
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...(await walk(full)));
      else if (e.name.endsWith('.md')) out.push(path.relative(abs, full).split(path.sep).join('/'));
    }
    return out;
  }
  return {
    list: () => walk(abs),
    read: (p) => fs.readFile(safe(p), 'utf8'),
    async write(p, text) {
      await fs.mkdir(path.dirname(safe(p)), { recursive: true });
      await fs.writeFile(safe(p), text);
    },
    watch(cb) {
      const w = watch(abs, { recursive: true }, (_e, f) => f && cb(String(f).split(path.sep).join('/')));
      return () => w.close();
    },
  };
}
