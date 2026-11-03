import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS } from '../src/mcp/instructions';

const milo = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../commands/milo.md'), 'utf8');

// Agent guidance shapes what every agent does. Edits must be deliberate: update the snapshot with `vitest -u`.
describe('agent guidance', () => {
  it('server instructions', () => {
    expect(INSTRUCTIONS).toMatchSnapshot();
  });
  it('/milo command', () => {
    expect(milo).toMatchSnapshot();
  });
  it('keeps the rules that matter', () => {
    for (const text of [INSTRUCTIONS, milo]) {
      expect(text).toMatch(/don't chart|without a mission/);
      expect(text).toContain('record_decision');
      expect(text).toMatch(/Never decide (HITL|a `hitl`)/);
    }
  });
});
