import { apiBase, restHeaders } from '../../adapters/remote/github/schema';
import { HttpClient, TrackerError, github, type HttpOptions } from '../../adapters/remote/http';
import type { CiProvider, PrReview, PullRequestSnapshot } from '../../model/prEvidence';
import { foldChecks, type GhCheckRun, type GhStatus } from './checkState';
import { bodyMarkers, branchRef, untrusted } from './prText';

interface GhPull {
  number: number;
  html_url: string;
  title: string;
  body?: string | null;
  state: 'open' | 'closed';
  merged_at: string | null;
  merged?: boolean;
  draft?: boolean;
  mergeable?: boolean | null;
  updated_at: string;
  head: { sha: string; ref: string; repo: { full_name: string } | null };
}

export interface GitHubCiOptions extends HttpOptions {
  /** `owner/name`. */
  repo: string;
  token: string;
  apiUrl?: string;
  /** PRs read per `recent()` call (one page). */
  recentLimit?: number;
}

const SHA = /^[0-9a-f]{7,64}$/i;

/** Pull requests, reviews, check runs and commit statuses of one repository. Read-only. */
export class GitHubCiProvider implements CiProvider {
  readonly name = 'github';
  readonly repo: string;
  readonly #token: string;
  readonly #http: HttpClient;
  readonly #base: string;
  readonly #limit: number;

  constructor(o: GitHubCiOptions) {
    const [owner, name] = o.repo.split('/');
    if (!owner || !name) throw new TrackerError('invalid', `GitHub repo must be "owner/name", got "${o.repo}"`);
    this.repo = o.repo;
    this.#token = o.token;
    this.#http = new HttpClient(github, o);
    this.#base = `${apiBase(o.apiUrl)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    this.#limit = Math.min(100, o.recentLimit ?? 50);
  }

  async #get<T>(path: string): Promise<T> {
    return (await this.#http.send<T>(`${this.#base}${path}`, { headers: restHeaders(this.#token) })).body;
  }

  #snapshot(p: GhPull, review: PrReview = 'none'): PullRequestSnapshot {
    const merged = !!p.merged_at || p.merged === true;
    const sha = SHA.test(p.head.sha) ? p.head.sha.toLowerCase() : '';
    return {
      number: p.number,
      url: `https://github.com/${this.repo}/pull/${p.number}`,
      title: untrusted(p.title),
      state: merged ? 'merged' : p.state === 'open' ? 'open' : 'closed',
      draft: !!p.draft,
      headSha: sha,
      headRef: untrusted(p.head.ref, 200),
      sameRepo: p.head.repo?.full_name?.toLowerCase() === this.repo.toLowerCase(),
      review,
      mergeable: p.mergeable === true ? 'clean' : p.mergeable === false ? 'conflicting' : 'unknown',
      updatedAt: Date.parse(p.updated_at) || 0,
    };
  }

  async recent() {
    const pulls = await this.#get<GhPull[]>(`/pulls?state=all&sort=updated&direction=desc&per_page=${this.#limit}`);
    return pulls.map((p) => {
      const pr = this.#snapshot(p);
      const fromBranch = pr.sameRepo ? branchRef(p.head.ref) : undefined;
      // forks can put anything in a body; only same-repo PRs link themselves
      const markers = pr.sameRepo ? bodyMarkers(p.body) : [];
      return { pr, markers: fromBranch && !markers.includes(fromBranch) ? [...markers, fromBranch] : markers };
    });
  }

  async forBranch(branch: string) {
    const owner = this.repo.split('/')[0];
    const head = encodeURIComponent(`${owner}:${branch}`);
    const pulls = await this.#get<GhPull[]>(`/pulls?state=all&head=${head}&per_page=10`);
    return pulls.map((p) => this.#snapshot(p)).filter((p) => p.sameRepo);
  }

  async pull(n: number) {
    const [p, reviews] = await Promise.all([
      this.#get<GhPull>(`/pulls/${n}`),
      this.#get<{ user: { login: string } | null; state: string }[]>(`/pulls/${n}/reviews?per_page=100`),
    ]);
    const latest = new Map<string, string>();
    for (const r of reviews) if (r.user && r.state !== 'PENDING') latest.set(r.user.login, r.state);
    const states = [...latest.values()];
    const review: PrReview = states.includes('CHANGES_REQUESTED')
      ? 'changes_requested'
      : states.includes('APPROVED')
        ? 'approved'
        : states.length
          ? 'commented'
          : 'none';
    return this.#snapshot(p, review);
  }

  async checks(sha: string, required: string[]) {
    if (!SHA.test(sha)) return foldChecks([], [], required, untrusted);
    const [runs, status] = await Promise.all([
      this.#get<{ check_runs: GhCheckRun[] }>(`/commits/${sha}/check-runs?per_page=100`),
      this.#get<{ statuses: GhStatus[] }>(`/commits/${sha}/status?per_page=100`),
    ]);
    return foldChecks(runs.check_runs ?? [], status.statuses ?? [], required, untrusted);
  }
}
