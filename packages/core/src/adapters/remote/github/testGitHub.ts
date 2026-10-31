import { describeError } from '../describeError';
import { HttpClient, github, type HttpOptions } from '../http';
import type { TrackerTestResult } from '../types';
import { apiBase, restHeaders } from './schema';

/** Settings "Test connection": can this token see the repo's issues, and can it write them? */
export async function testGitHub(
  o: { repo: string; token: string; apiUrl?: string } & HttpOptions,
): Promise<TrackerTestResult> {
  const api = apiBase(o.apiUrl);
  const http = new HttpClient(github, { retries: 0, ...o });
  const headers = restHeaders(o.token);
  const [owner, name] = o.repo.trim().split('/');
  if (!owner || !name) return { ok: false, code: 'invalid', error: 'Enter the repository as owner/name' };
  try {
    const { body: repo } = await http.send<{
      full_name: string;
      has_issues: boolean;
      permissions?: Record<string, boolean>;
    }>(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, { headers });
    // GitHub App installation tokens have no user; the repo check above is what matters.
    const account = await http
      .send<{ login: string }>(`${api}/user`, { headers })
      .then((r) => `@${r.body.login}`)
      .catch(() => undefined);
    if (!repo.has_issues)
      return {
        ok: false,
        code: 'invalid',
        target: repo.full_name,
        account,
        error: 'Issues are turned off for this repository',
      };
    const p = repo.permissions;
    const canWrite = p ? !!(p.push || p.triage || p.maintain || p.admin) : undefined;
    return { ok: true, account, target: repo.full_name, canWrite, rate: http.rate };
  } catch (err) {
    return { ok: false, ...describeError(err, 'GitHub') };
  }
}
