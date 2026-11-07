import { describe, expect, it } from 'vitest';
import { greeting } from '../src/greeting';

const base = { version: '1.2.3', tagline: 'You pick the destination.', isTTY: true, columns: 120, noColor: false };

describe('greeting', () => {
  it('prints nothing when stdout is not a terminal, so pipes and scripts stay clean', () => {
    expect(greeting({ ...base, isTTY: false })).toBe('');
  });

  it('shows the wordmark on a wide terminal, with the version', () => {
    const text = greeting(base);
    expect(text).toContain('████████╗');
    expect(text).toContain('v1.2.3');
  });

  it('falls back to plain text on a narrow terminal', () => {
    expect(greeting({ ...base, columns: 80 })).toContain('████████╗');
    const narrow = greeting({ ...base, columns: 60 });
    expect(narrow).not.toContain('████████╗');
    expect(narrow).toContain('Teamtrail');
  });

  it('never exceeds the terminal width it was sized for', () => {
    for (const columns of [60, 76, 120]) {
      for (const line of greeting({ ...base, columns, noColor: true }).split('\n')) {
        expect(line.length).toBeLessThanOrEqual(columns);
      }
    }
  });

  it('leaves out colour codes with NO_COLOR', () => {
    expect(greeting({ ...base, noColor: true })).not.toContain('\x1b[');
    expect(greeting(base)).toContain('\x1b[');
  });
});
