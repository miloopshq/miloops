import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const doc = readFileSync(path.join(root, 'AGENTS.md'), 'utf8');

/** Backticked repo paths in AGENTS.md: anything under a top-level folder, or a root file. Patterns and placeholders are skipped. */
const repoPaths = [...doc.matchAll(/`([^`\s]+)`/g)]
  .map((m) => m[1].replace(/[.,:;]$/, ''))
  .filter((p) => /^(packages|apps|scripts|brand|\.github)\//.test(p) || /^[A-Z_]+\.md$/.test(p))
  .filter((p) => !/[<>*…]/.test(p));

describe('AGENTS.md', () => {
  it('names real files', () => {
    expect(repoPaths.length).toBeGreaterThan(20);
    const missing = repoPaths.filter((p) => !existsSync(path.join(root, p)));
    expect(missing).toEqual([]);
  });
});
