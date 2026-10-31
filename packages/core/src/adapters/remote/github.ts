import { BRAND, MAP_LABEL, PLAN_ONLY_LABEL } from '../../brand';
import { serializeMapBody, parseMapBody } from '../../mapBody';
import { DEFAULT_MAP_MODE, type Comment, type DecisionRecord, type MapDoc, type MapMode, type MapSections, type MapSnapshot, type MapSummary, type Ticket, type TicketType } from '../../types';
import { ALL_LABELS, authoredBody, decisionComment, joinBody, mapLabels, parseDecisionComment, readComment, splitBody, ticketFromIssue, ticketLabels } from './format';
import { HttpClient, TrackerError, github, graphqlError, type HttpOptions } from './http';
import { SyncedAdapter, type SyncOptions } from './synced';
import type { TrackerTestResult } from './types';

/*
 * GitHub Issues mapping:
 *   mission    issue labelled MAP_LABEL; body = canonical map body (mapBody.ts)
 *   ticket     sub-issue of the mission issue, labelled miloops:<type>
 *   blockedBy  native issue dependency ("blocked by")
 *   close      closed as completed / not planned
 *   decision   comment on the ticket (format.ts)
 * Reads: one GraphQL query per mission. Polling: an ETag-conditional issue
 * list, so an idle repo costs nothing against the rate limit (304s are free).
 */

export interface GitHubOptions extends SyncOptions, HttpOptions {
  /** `owner/name`. */
  repo: string;
  token: string;
  /** REST base, default https://api.github.com (GitHub Enterprise: https://host/api/v3). */
  apiUrl?: string;
}

const DEFAULT_API = 'https://api.github.com';

interface RestIssue {
  id: number;
  node_id: string;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  state_reason?: string | null;
  labels: ({ name: string } | string)[];
  assignees?: { login: string }[];
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  pull_request?: unknown;
}

interface GqlComment {
  databaseId: number;
  body: string;
  createdAt: string;
  author: { login: string } | null;
}

interface GqlIssue {
  id: string;
  databaseId: number;
  number: number;
  title: string;
  body: string;
  state: 'OPEN' | 'CLOSED';
  stateReason: 'COMPLETED' | 'NOT_PLANNED' | 'DUPLICATE' | 'REOPENED' | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  labels: { nodes: { name: string }[] };
  assignees: { nodes: { login: string }[] };
  comments: { nodes: GqlComment[] };
  blockedBy?: { nodes: { number: number }[] };
  subIssues?: { nodes: GqlIssue[] };
}

const ISSUE_FIELDS = `id databaseId number title body state stateReason createdAt updatedAt closedAt
  labels(first: 30) { nodes { name } }
  assignees(first: 5) { nodes { login } }
  comments(first: 100) { nodes { databaseId body createdAt author { login } } }`;

const MISSION_QUERY = `query Mission($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      ${ISSUE_FIELDS}
      subIssues(first: 100) { nodes { ${ISSUE_FIELDS} blockedBy(first: 50) { nodes { number } } } }
    }
  }
}`;

const labelNames = (ls: ({ name: string } | string)[]) => ls.map((l) => (typeof l === 'string' ? l : l.name));

const graphqlUrl = (api: string) => (/\/api\/v3$/.test(api) ? api.replace(/\/api\/v3$/, '/api/graphql') : `${api}/graphql`);

function restHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': BRAND.slug };
}

export class GitHubAdapter extends SyncedAdapter {
  readonly kind = 'github' as const;
  readonly label = 'GitHub Issues';
  readonly location: string;
  private http: HttpClient;
  private api: string;
  private owner: string;
  private name: string;
  /** Issue number → REST id (sub-issue and dependency endpoints take ids, not numbers). */
  private issueIds = new Map<string, number>();
  /** `<mission>/<D-n>` → comment id holding the record. */
  private decisionComments = new Map<string, number>();
  private labelsReady?: Promise<void>;
  private etag?: string;
  private cursor?: string;

  constructor(private o: GitHubOptions) {
    super({ pollMs: 8000, ...o });
    const [owner, name] = o.repo.split('/');
    if (!owner || !name) throw new TrackerError('invalid', `GitHub repo must be "owner/name", got "${o.repo}"`);
    this.owner = owner;
    this.name = name;
    this.location = `${owner}/${name}`;
    this.api = (o.apiUrl ?? DEFAULT_API).replace(/\/$/, '');
    this.http = new HttpClient(github, o);
  }

  protected rate() {
    return this.http.rate;
  }

  private async rest<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    return this.http.send<T>(`${this.api}${path}`, {
      method,
      headers: { ...restHeaders(this.o.token), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  private repoPath(rest = '') {
    return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.name)}${rest}`;
  }

  private async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const r = await this.http.send<{ data?: T }>(graphqlUrl(this.api), {
      method: 'POST',
      headers: { ...restHeaders(this.o.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const err = graphqlError('GitHub', r.body);
    if (err) throw err;
    return r.body.data as T;
  }

  private ensureLabels() {
    this.labelsReady ??= (async () => {
      const r = await this.rest<{ name: string }[]>('GET', this.repoPath('/labels?per_page=100'));
      const have = new Set(r.body.map((l) => l.name));
      for (const l of ALL_LABELS.filter((x) => !have.has(x.name))) {
        await this.rest('POST', this.repoPath('/labels'), l).catch((e) => {
          if (!(e instanceof TrackerError && e.code === 'invalid')) throw e; // 422: created concurrently
        });
      }
    })().catch((e) => {
      this.labelsReady = undefined;
      throw e;
    });
    return this.labelsReady;
  }

  protected async fetchMaps(): Promise<MapSummary[]> {
    const r = await this.rest<RestIssue[]>('GET', this.repoPath(`/issues?labels=${encodeURIComponent(MAP_LABEL)}&state=all&per_page=100`));
    return r.body.filter((i) => !i.pull_request).map((i) => ({ id: String(i.number), key: `#${i.number}`, title: i.title }));
  }

  private comments(mapId: string, issue: GqlIssue, decisions: DecisionRecord[]): Comment[] {
    const out: Comment[] = [];
    for (const c of issue.comments.nodes) {
      const d = parseDecisionComment(c.body);
      if (d) {
        decisions.push({ ...d, mapId });
        this.decisionComments.set(`${mapId}/${d.id}`, c.databaseId);
        continue;
      }
      const parsed = readComment({ id: String(c.databaseId), body: c.body, author: c.author?.login, createdAt: c.createdAt });
      if (parsed) out.push(parsed);
    }
    return out;
  }

  protected async fetchMap(mapId: string): Promise<{ snap: MapSnapshot; decisions: DecisionRecord[] }> {
    const data = await this.gql<{ repository: { issue: GqlIssue | null } | null }>(MISSION_QUERY, { owner: this.owner, name: this.name, number: Number(mapId) });
    const root = data.repository?.issue;
    const labels = root ? root.labels.nodes.map((l) => l.name) : [];
    if (!root || !labels.includes(MAP_LABEL)) throw new TrackerError('not_found', `GitHub: #${mapId} is not a mission in ${this.location}`);
    this.issueIds.set(mapId, root.databaseId);
    const decisions: DecisionRecord[] = [];
    this.comments(mapId, root, decisions);
    const subs = root.subIssues?.nodes ?? [];
    const siblings = new Set(subs.map((s) => String(s.number)));
    const tickets: Ticket[] = subs.map((s) => {
      this.issueIds.set(String(s.number), s.databaseId);
      return ticketFromIssue({
        id: String(s.number),
        key: `#${s.number}`,
        title: s.title,
        labels: s.labels.nodes.map((l) => l.name),
        body: s.body,
        closed: s.state === 'CLOSED',
        closeReason: s.stateReason === 'NOT_PLANNED' || s.stateReason === 'DUPLICATE' ? 'not_planned' : 'completed',
        trackerAssignee: s.assignees.nodes[0]?.login,
        blockedBy: (s.blockedBy?.nodes ?? []).map((b) => String(b.number)).filter((n) => siblings.has(n)),
        comments: this.comments(mapId, s, decisions),
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        closedAt: s.closedAt,
      });
    });
    const map: MapDoc = {
      id: mapId,
      key: `#${root.number}`,
      title: root.title,
      mode: labels.includes(PLAN_ONLY_LABEL) ? 'plan-only' : DEFAULT_MAP_MODE,
      sections: parseMapBody(splitBody(root.body).text),
      createdAt: Date.parse(root.createdAt) || 0,
      updatedAt: Date.parse(root.updatedAt) || 0,
    };
    return { snap: { map, tickets: tickets.sort((a, b) => a.createdAt - b.createdAt || Number(a.id) - Number(b.id)) }, decisions };
  }

  protected async changedSince(known: (ref: string) => string | undefined): Promise<string[] | 'all'> {
    const r = await this.rest<RestIssue[]>('GET', this.repoPath('/issues?state=all&sort=updated&direction=desc&per_page=50'), undefined, this.etag ? { 'If-None-Match': this.etag } : {});
    if (r.status === 304) return [];
    this.etag = r.headers.get('etag') ?? undefined;
    const items = Array.isArray(r.body) ? r.body : [];
    const newest = items.reduce((m, i) => (i.updated_at > m ? i.updated_at : m), this.cursor ?? '');
    const since = this.cursor;
    this.cursor = newest;
    // the cached list predates this baseline: anything created in between only shows up through a full resync
    if (since === undefined) return 'all';
    const out: string[] = [];
    for (const i of items.filter((x) => x.updated_at > since && !x.pull_request)) {
      const mission = known(String(i.number));
      if (mission) out.push(mission);
      else if (labelNames(i.labels).some((l) => l.startsWith(`${BRAND.labelPrefix}:`))) return 'all';
    }
    return out;
  }

  private async issueId(number: string) {
    let id = this.issueIds.get(number);
    if (id === undefined) {
      id = (await this.rest<RestIssue>('GET', this.repoPath(`/issues/${number}`))).body.id;
      this.issueIds.set(number, id);
    }
    return id;
  }

  protected async remoteCreateMap(input: { title: string; sections: MapSections; mode: MapMode }): Promise<MapDoc> {
    await this.ensureLabels();
    const { body: i } = await this.rest<RestIssue>('POST', this.repoPath('/issues'), { title: input.title, body: serializeMapBody(input.sections), labels: mapLabels(input.mode) });
    this.issueIds.set(String(i.number), i.id);
    return { id: String(i.number), key: `#${i.number}`, title: i.title, mode: input.mode, sections: input.sections, createdAt: Date.parse(i.created_at), updatedAt: Date.parse(i.updated_at) };
  }

  protected async remoteCreateTicket(map: MapDoc, input: { title: string; type: TicketType; body: string; hitl?: boolean }): Promise<Ticket> {
    await this.ensureLabels();
    const { body: i } = await this.rest<RestIssue>('POST', this.repoPath('/issues'), { title: input.title, body: input.body, labels: ticketLabels(input.type, input.hitl) });
    this.issueIds.set(String(i.number), i.id);
    await this.rest('POST', this.repoPath(`/issues/${map.id}/sub_issues`), { sub_issue_id: i.id });
    return ticketFromIssue({
      id: String(i.number),
      key: `#${i.number}`,
      title: i.title,
      labels: labelNames(i.labels),
      body: i.body,
      closed: false,
      blockedBy: [],
      comments: [],
      createdAt: i.created_at,
      updatedAt: i.updated_at,
    });
  }

  protected async remoteAddBlocking(_map: MapDoc, blocker: Ticket, blocked: Ticket) {
    await this.rest('POST', this.repoPath(`/issues/${blocked.id}/dependencies/blocked_by`), { issue_id: await this.issueId(blocker.id) });
  }

  protected async remoteSetClaim(_map: MapDoc, t: Ticket) {
    await this.rest('PATCH', this.repoPath(`/issues/${t.id}`), { body: joinBody(t.body, { assignee: t.assignee }) });
  }

  protected async remoteComment(_map: MapDoc, t: Ticket, author: string, body: string, writeId: string) {
    await this.rest('POST', this.repoPath(`/issues/${t.id}/comments`), { body: authoredBody(author, body, writeId) });
  }

  protected async remoteClose(_map: MapDoc, t: Ticket, reason: 'completed' | 'not_planned') {
    await this.rest('PATCH', this.repoPath(`/issues/${t.id}`), { state: 'closed', state_reason: reason });
  }

  protected async remoteUpdateMap(map: MapDoc) {
    await this.rest('PATCH', this.repoPath(`/issues/${map.id}`), { body: serializeMapBody(map.sections) });
  }

  protected async remoteSetMode(map: MapDoc, mode: MapMode) {
    if (mode === 'plan-only') await this.rest('POST', this.repoPath(`/issues/${map.id}/labels`), { labels: [PLAN_ONLY_LABEL] });
    else
      await this.rest('DELETE', this.repoPath(`/issues/${map.id}/labels/${encodeURIComponent(PLAN_ONLY_LABEL)}`)).catch((e) => {
        if (!(e instanceof TrackerError && e.code === 'not_found')) throw e;
      });
  }

  protected async remotePostDecision(map: MapDoc, d: DecisionRecord, ticket?: Ticket) {
    const { body: c } = await this.rest<{ id: number }>('POST', this.repoPath(`/issues/${ticket?.id ?? map.id}/comments`), { body: decisionComment(d) });
    this.decisionComments.set(`${map.id}/${d.id}`, c.id);
  }

  protected async remoteUpdateDecision(map: MapDoc, d: DecisionRecord) {
    const id = this.decisionComments.get(`${map.id}/${d.id}`);
    if (id === undefined) throw new TrackerError('not_found', `GitHub: no comment holds decision ${d.id}`);
    await this.rest('PATCH', this.repoPath(`/issues/comments/${id}`), { body: decisionComment(d) });
  }
}

/** Settings "Test connection": can this token see the repo's issues, and can it write them? */
export async function testGitHub(o: { repo: string; token: string; apiUrl?: string } & HttpOptions): Promise<TrackerTestResult> {
  const api = (o.apiUrl ?? DEFAULT_API).replace(/\/$/, '');
  const http = new HttpClient(github, { retries: 0, ...o });
  const headers = restHeaders(o.token);
  const [owner, name] = o.repo.trim().split('/');
  if (!owner || !name) return { ok: false, code: 'invalid', error: 'Enter the repository as owner/name' };
  try {
    const { body: repo } = await http.send<{ full_name: string; has_issues: boolean; permissions?: Record<string, boolean> }>(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, { headers });
    // GitHub App installation tokens have no user; the repo check above is what matters.
    const account = await http
      .send<{ login: string }>(`${api}/user`, { headers })
      .then((r) => `@${r.body.login}`)
      .catch(() => undefined);
    if (!repo.has_issues) return { ok: false, code: 'invalid', target: repo.full_name, account, error: 'Issues are turned off for this repository' };
    const p = repo.permissions;
    const canWrite = p ? !!(p.push || p.triage || p.maintain || p.admin) : undefined;
    return { ok: true, account, target: repo.full_name, canWrite, rate: http.rate };
  } catch (err) {
    return { ok: false, ...describeError(err, 'GitHub') };
  }
}

export function describeError(err: unknown, name: string): Pick<TrackerTestResult, 'error' | 'code'> {
  if (!(err instanceof TrackerError)) return { code: 'http', error: String((err as Error)?.message ?? err) };
  const hint: Partial<Record<TrackerError['code'], string>> = {
    offline: `${name} is unreachable. Check your connection.`,
    auth: name === 'GitHub' ? 'Token rejected. Run `gh auth login`, or paste a token with repo access.' : 'API key rejected. Create a new personal API key in Linear.',
    not_found: name === 'GitHub' ? 'Repository not found, or this token cannot see it.' : 'Team not found, or this key cannot see it.',
  };
  return { code: err.code, error: hint[err.code] ?? err.message };
}
