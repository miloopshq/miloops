/**
 * In-memory stand-in for the pull request, review, check-run and commit
 * status endpoints the reconciler reads. Shapes follow the live REST API,
 * trimmed to the fields read. Every request is logged so tests can assert
 * that the reconciler only ever reads.
 */
export interface FakePull {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged: boolean;
  draft: boolean;
  mergeable: boolean | null;
  head: { sha: string; ref: string; repo: string };
  updated: number;
  reviews: { user: string; state: string }[];
}

export interface FakeCheck {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

export function fakeGitHubPulls(opts: { repo?: string } = {}) {
  const repo = opts.repo ?? 'octo-org/launchpad';
  const pulls = new Map<number, FakePull>();
  const checkRuns = new Map<string, FakeCheck[]>();
  const statuses = new Map<string, { context: string; state: string }[]>();
  const requests: { method: string; path: string; auth: string | null }[] = [];
  let rateLimitedUntil = 0;
  let failing: RegExp | undefined;
  let clock = Date.UTC(2026, 9, 31, 12, 0, 0);
  let checkId = 1;

  const iso = (t: number) => new Date(t).toISOString();
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  const rest = (p: FakePull) => ({
    number: p.number,
    html_url: `https://github.com/${repo}/pull/${p.number}`,
    title: p.title,
    body: p.body,
    state: p.state,
    merged_at: p.merged ? iso(p.updated) : null,
    merged: p.merged,
    draft: p.draft,
    mergeable: p.mergeable,
    updated_at: iso(p.updated),
    head: { sha: p.head.sha, ref: p.head.ref, repo: { full_name: p.head.repo } },
  });

  async function fetch(input: string | URL | Request, init: RequestInit = {}) {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const auth = new Headers(init.headers).get('authorization');
    requests.push({ method, path: url.pathname + url.search, auth });
    if (Date.now() < rateLimitedUntil)
      return json({ message: 'API rate limit exceeded' }, 403, {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(Math.ceil(rateLimitedUntil / 1000)),
      });
    if (failing?.test(url.pathname)) return json({ message: 'Server Error' }, 500);
    const base = `/repos/${repo}`;
    if (method !== 'GET' || !url.pathname.startsWith(base)) return json({ message: 'Not Found' }, 404);
    const p = url.pathname.slice(base.length);
    const q = url.searchParams;
    if (p === '/pulls') {
      let list = [...pulls.values()].sort((a, b) => b.updated - a.updated);
      const head = q.get('head');
      if (head) list = list.filter((x) => `${x.head.repo.split('/')[0]}:${x.head.ref}` === head);
      return json(list.slice(0, Number(q.get('per_page') ?? 30)).map(rest));
    }
    const one = p.match(/^\/pulls\/(\d+)(\/reviews)?$/);
    if (one) {
      const pr = pulls.get(Number(one[1]));
      if (!pr) return json({ message: 'Not Found' }, 404);
      if (one[2]) return json(pr.reviews.map((r) => ({ user: { login: r.user }, state: r.state })));
      return json(rest(pr));
    }
    const c = p.match(/^\/commits\/([0-9a-f]+)\/(check-runs|status)$/);
    if (c) {
      if (c[2] === 'check-runs') {
        const runs = checkRuns.get(c[1]) ?? [];
        return json({
          total_count: runs.length,
          check_runs: runs.map((r) => ({ ...r, html_url: `https://github.com/${repo}/runs/${r.id}` })),
        });
      }
      return json({ state: 'pending', statuses: statuses.get(c[1]) ?? [] });
    }
    return json({ message: 'Not Found' }, 404);
  }

  return {
    repo,
    fetch: fetch as typeof globalThis.fetch,
    requests,
    open(n: number, o: Partial<FakePull> & { sha: string; ref: string; headRepo?: string }) {
      const { sha, ref, headRepo, ...rest_ } = o;
      pulls.set(n, {
        number: n,
        title: `PR ${n}`,
        body: null,
        state: 'open',
        merged: false,
        draft: false,
        mergeable: true,
        reviews: [],
        ...rest_,
        head: { sha, ref, repo: headRepo ?? repo },
        updated: (clock += 1000),
      });
    },
    update(n: number, patch: Partial<FakePull> & { sha?: string }) {
      const pr = pulls.get(n)!;
      const { sha, ...rest_ } = patch;
      Object.assign(pr, rest_, { updated: (clock += 1000) });
      if (sha) pr.head.sha = sha;
    },
    check(sha: string, name: string, status: string, conclusion: string | null = null) {
      const list = checkRuns.get(sha) ?? [];
      list.push({ id: checkId++, name, status, conclusion });
      checkRuns.set(sha, list);
    },
    status(sha: string, context: string, state: string) {
      statuses.set(sha, [...(statuses.get(sha) ?? []), { context, state }]);
    },
    rateLimit(ms: number) {
      rateLimitedUntil = Date.now() + ms;
    },
    fail(path?: RegExp) {
      failing = path;
    },
  };
}
