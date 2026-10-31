import { HttpClient, TrackerError, github, graphqlError, type HttpOptions } from '../http';
import { apiBase, graphqlUrl, restHeaders } from './schema';

export interface GitHubClientOptions extends HttpOptions {
  /** `owner/name`. */
  repo: string;
  token: string;
  apiUrl?: string;
}

/** REST and GraphQL calls against one repository. */
export class GitHubClient {
  readonly owner: string;
  readonly name: string;
  private api: string;
  private http: HttpClient;

  constructor(private readonly o: GitHubClientOptions) {
    const [owner, name] = o.repo.split('/');
    if (!owner || !name) throw new TrackerError('invalid', `GitHub repo must be "owner/name", got "${o.repo}"`);
    this.owner = owner;
    this.name = name;
    this.api = apiBase(o.apiUrl);
    this.http = new HttpClient(github, o);
  }

  get rate() {
    return this.http.rate;
  }

  /** A REST call under `/repos/<owner>/<name>`. */
  async repo<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    return this.http.send<T>(
      `${this.api}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.name)}${path}`,
      {
        method,
        headers: { ...restHeaders(this.o.token), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
  }

  async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const r = await this.http.send<{ data?: T }>(graphqlUrl(this.api), {
      method: 'POST',
      headers: { ...restHeaders(this.o.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const err = graphqlError('GitHub', r.body);
    if (err) throw err;
    return r.body.data as T;
  }
}
