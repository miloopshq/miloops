import { TrackerError } from './http';
import type { TrackerTestResult } from './types';

/** A "Test connection" failure as the code and the hint Settings shows for it. */
export function describeError(err: unknown, name: string): Pick<TrackerTestResult, 'error' | 'code'> {
  if (!(err instanceof TrackerError)) return { code: 'http', error: String((err as Error)?.message ?? err) };
  const hint: Partial<Record<TrackerError['code'], string>> = {
    offline: `${name} is unreachable. Check your connection.`,
    auth:
      name === 'GitHub'
        ? 'Token rejected. Run `gh auth login`, or paste a token with repo access.'
        : 'API key rejected. Create a new personal API key in Linear.',
    not_found:
      name === 'GitHub'
        ? 'Repository not found, or this token cannot see it.'
        : 'Team not found, or this key cannot see it.',
  };
  return { code: err.code, error: hint[err.code] ?? err.message };
}
