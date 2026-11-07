import { ALL_LABELS } from '../format';
import { TrackerError } from '../http';
import type { GitHubClient } from './githubClient';

/** Creates the Teamtrail labels the repository doesn't have yet. */
export async function ensureGitHubLabels(gh: GitHubClient) {
  const r = await gh.repo<{ name: string }[]>('GET', '/labels?per_page=100');
  const have = new Set(r.body.map((l) => l.name));
  for (const l of ALL_LABELS.filter((x) => !have.has(x.name))) {
    await gh.repo('POST', '/labels', l).catch((e) => {
      if (!(e instanceof TrackerError && e.code === 'invalid')) throw e; // 422: created concurrently
    });
  }
}
