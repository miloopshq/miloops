import { existsSync, statSync } from 'node:fs';
import fs from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** Serves a file of the lookout bundle; unknown paths get `index.html` (client-side routes). */
export async function serveStatic(appDir: string, pathname: string, res: http.ServerResponse) {
  let rel = decodeURIComponent(pathname);
  let file = path.join(appDir, path.normalize(rel));
  if (!file.startsWith(appDir + path.sep) || !existsSync(file) || statSync(file).isDirectory()) {
    rel = '/index.html';
    file = path.join(appDir, 'index.html');
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.end(await fs.readFile(file));
}
