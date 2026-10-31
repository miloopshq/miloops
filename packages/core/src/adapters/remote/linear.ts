import { BRAND, MAP_LABEL, PLAN_ONLY_LABEL } from '../../brand';
import { parseMapBody, serializeMapBody } from '../../mapBody';
import { DEFAULT_MAP_MODE, type Comment, type DecisionRecord, type MapDoc, type MapMode, type MapSections, type MapSnapshot, type MapSummary, type Ticket, type TicketType } from '../../types';
import { ALL_LABELS, authoredBody, decisionComment, joinBody, mapLabels, parseDecisionComment, readComment, splitBody, ticketFromIssue, ticketLabels } from './format';
import { describeError } from './github';
import { HttpClient, TrackerError, graphqlError, linear, type HttpOptions } from './http';
import { SyncedAdapter, type SyncOptions } from './synced';
import type { TrackerTestResult } from './types';

/*
 * Linear mapping:
 *   mission    issue labelled MAP_LABEL in the team (and project, when set); description = canonical map body
 *   ticket     sub-issue (parentId = mission), labelled miloops:<type>
 *   blockedBy  native "blocks" relation
 *   close      the team's first "completed" state, or its first "canceled" state for not planned
 *   decision   comment on the ticket (format.ts)
 * Polling: issues and comments with `updatedAt > cursor`, one request per poll.
 */

export interface LinearOptions extends SyncOptions, HttpOptions {
  /** Personal API key (`lin_api_…`) or an OAuth access token. */
  apiKey: string;
  teamId: string;
  projectId?: string;
  apiUrl?: string;
  /** HUD location, e.g. `ENG · Mobile`; defaults to the team key once known. */
  display?: string;
}

const DEFAULT_API = 'https://api.linear.app/graphql';

interface LIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  state: { type: string };
  labels: { nodes: { id: string; name: string }[] };
  assignee: { displayName: string } | null;
  comments: { nodes: { id: string; body: string; createdAt: string; user: { displayName: string } | null }[] };
  inverseRelations?: { nodes: { type: string; issue: { id: string } }[] };
  children?: { nodes: LIssue[] };
}

const ISSUE_FIELDS = `id identifier title description createdAt updatedAt completedAt canceledAt
  state { type }
  labels { nodes { id name } }
  assignee { displayName }
  comments(first: 100) { nodes { id body createdAt user { displayName } } }`;

const MISSION_QUERY = `query Mission($id: String!) {
  issue(id: $id) {
    ${ISSUE_FIELDS}
    children(first: 100) { nodes { ${ISSUE_FIELDS} inverseRelations(first: 50) { nodes { type issue { id } } } } }
  }
}`;

const TEAM_QUERY = `query Team($id: String!, $prefix: String!) {
  team(id: $id) { id key name states { nodes { id name type position } } }
  issueLabels(first: 100, filter: { name: { startsWith: $prefix } }) { nodes { id name team { id } } }
}`;

const authHeader = (key: string) => (key.startsWith('lin_api_') ? key : `Bearer ${key}`);
const isClosed = (s: { type: string }) => s.type === 'completed' || s.type === 'canceled';

export class LinearAdapter extends SyncedAdapter {
  readonly kind = 'linear' as const;
  readonly label = 'Linear';
  location: string;
  private http: HttpClient;
  private team?: Promise<{ key: string; name: string; done: string; canceled: string; labels: Map<string, string> }>;
  private decisionComments = new Map<string, string>();
  private cursor?: string;

  constructor(private o: LinearOptions) {
    super({ pollMs: 12_000, ...o });
    this.http = new HttpClient(linear, o);
    this.location = o.display ?? o.teamId;
  }

  protected rate() {
    return this.http.rate;
  }

  private async gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const r = await this.http.send<{ data?: T }>(this.o.apiUrl ?? DEFAULT_API, {
      method: 'POST',
      headers: { Authorization: authHeader(this.o.apiKey), 'Content-Type': 'application/json', 'User-Agent': BRAND.slug },
      body: JSON.stringify({ query, variables }),
    });
    const err = graphqlError('Linear', r.body);
    if (err) throw err;
    return r.body.data as T;
  }

  /** Team states and MILOOPS labels, creating missing labels once. */
  private meta() {
    this.team ??= (async () => {
      const d = await this.gql<{
        team: { key: string; name: string; states: { nodes: { id: string; type: string; position: number }[] } } | null;
        issueLabels: { nodes: { id: string; name: string; team: { id: string } | null }[] };
      }>(TEAM_QUERY, { id: this.o.teamId, prefix: `${BRAND.labelPrefix}:` });
      if (!d.team) throw new TrackerError('not_found', `Linear: team ${this.o.teamId} not found`);
      const first = (type: string) => d.team!.states.nodes.filter((s) => s.type === type).sort((a, b) => a.position - b.position)[0]?.id ?? '';
      const labels = new Map(d.issueLabels.nodes.filter((l) => !l.team || l.team.id === this.o.teamId).map((l) => [l.name, l.id]));
      for (const l of ALL_LABELS.filter((x) => !labels.has(x.name))) {
        const r = await this.gql<{ issueLabelCreate: { issueLabel: { id: string; name: string } } }>(
          `mutation Label($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { issueLabel { id name } } }`,
          { input: { name: l.name, color: `#${l.color}`, teamId: this.o.teamId } },
        );
        labels.set(l.name, r.issueLabelCreate.issueLabel.id);
      }
      if (!this.o.display) this.location = d.team.key;
      return { key: d.team.key, name: d.team.name, done: first('completed'), canceled: first('canceled'), labels };
    })().catch((e) => {
      this.team = undefined;
      throw e;
    });
    return this.team;
  }

  private async labelIds(names: string[]) {
    const { labels } = await this.meta();
    return names.map((n) => labels.get(n)).filter((x): x is string => !!x);
  }

  private missionFilter() {
    return {
      team: { id: { eq: this.o.teamId } },
      labels: { some: { name: { eq: MAP_LABEL } } },
      ...(this.o.projectId ? { project: { id: { eq: this.o.projectId } } } : {}),
    };
  }

  protected async fetchMaps(): Promise<MapSummary[]> {
    const d = await this.gql<{ issues: { nodes: { id: string; identifier: string; title: string }[] } }>(
      `query Missions($filter: IssueFilter) { issues(first: 100, filter: $filter) { nodes { id identifier title } } }`,
      { filter: this.missionFilter() },
    );
    return d.issues.nodes.map((i) => ({ id: i.id, key: i.identifier, title: i.title }));
  }

  private comments(mapId: string, issue: LIssue, decisions: DecisionRecord[]): Comment[] {
    const out: Comment[] = [];
    for (const c of [...issue.comments.nodes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const d = parseDecisionComment(c.body);
      if (d) {
        decisions.push({ ...d, mapId });
        this.decisionComments.set(`${mapId}/${d.id}`, c.id);
        continue;
      }
      const parsed = readComment({ id: c.id, body: c.body, author: c.user?.displayName, createdAt: c.createdAt });
      if (parsed) out.push(parsed);
    }
    return out;
  }

  private ticket(mapId: string, i: LIssue, decisions: DecisionRecord[], siblings: Set<string>): Ticket {
    return ticketFromIssue({
      id: i.id,
      key: i.identifier,
      title: i.title,
      labels: i.labels.nodes.map((l) => l.name),
      body: i.description,
      closed: isClosed(i.state),
      closeReason: i.state.type === 'canceled' ? 'not_planned' : 'completed',
      trackerAssignee: i.assignee?.displayName,
      blockedBy: (i.inverseRelations?.nodes ?? []).filter((r) => r.type === 'blocks' && siblings.has(r.issue.id)).map((r) => r.issue.id),
      comments: this.comments(mapId, i, decisions),
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      closedAt: i.completedAt ?? i.canceledAt,
    });
  }

  protected async fetchMap(mapId: string): Promise<{ snap: MapSnapshot; decisions: DecisionRecord[] }> {
    const d = await this.gql<{ issue: LIssue | null }>(MISSION_QUERY, { id: mapId });
    const root = d.issue;
    const labels = root?.labels.nodes.map((l) => l.name) ?? [];
    if (!root || !labels.includes(MAP_LABEL)) throw new TrackerError('not_found', `Linear: ${mapId} is not a mission`);
    const decisions: DecisionRecord[] = [];
    this.comments(mapId, root, decisions);
    const kids = root.children?.nodes ?? [];
    const siblings = new Set(kids.map((k) => k.id));
    const map: MapDoc = {
      id: root.id,
      key: root.identifier,
      title: root.title,
      mode: labels.includes(PLAN_ONLY_LABEL) ? 'plan-only' : DEFAULT_MAP_MODE,
      sections: parseMapBody(splitBody(root.description).text),
      createdAt: Date.parse(root.createdAt) || 0,
      updatedAt: Date.parse(root.updatedAt) || 0,
    };
    const tickets = kids.map((k) => this.ticket(mapId, k, decisions, siblings)).sort((a, b) => a.createdAt - b.createdAt);
    return { snap: { map, tickets }, decisions };
  }

  protected async changedSince(known: (ref: string) => string | undefined): Promise<string[] | 'all'> {
    if (this.cursor === undefined) {
      this.cursor = new Date(this.now()).toISOString();
      return 'all';
    }
    const since = this.cursor;
    const d = await this.gql<{
      issues: { nodes: { id: string; updatedAt: string; parent: { id: string } | null; labels: { nodes: { name: string }[] } }[] };
      comments: { nodes: { updatedAt: string; issue: { id: string; parent: { id: string } | null } | null }[] };
    }>(
      `query Changes($issues: IssueFilter, $comments: CommentFilter) {
        issues(first: 50, filter: $issues) { nodes { id updatedAt parent { id } labels { nodes { name } } } }
        comments(first: 50, filter: $comments) { nodes { updatedAt issue { id parent { id } } } }
      }`,
      { issues: { team: { id: { eq: this.o.teamId } }, updatedAt: { gt: since } }, comments: { updatedAt: { gt: since }, issue: { team: { id: { eq: this.o.teamId } } } } },
    );
    const stamps = [...d.issues.nodes.map((i) => i.updatedAt), ...d.comments.nodes.map((c) => c.updatedAt)];
    this.cursor = stamps.reduce((m, s) => (s > m ? s : m), since);
    const out: string[] = [];
    const refs = [...d.issues.nodes.map((i) => ({ id: i.id, parent: i.parent?.id, labels: i.labels.nodes.map((l) => l.name) })), ...d.comments.nodes.filter((c) => c.issue).map((c) => ({ id: c.issue!.id, parent: c.issue!.parent?.id, labels: [] as string[] }))];
    for (const r of refs) {
      const mission = known(r.id) ?? (r.parent ? known(r.parent) : undefined);
      if (mission) out.push(mission);
      else if (r.labels.includes(MAP_LABEL)) return 'all';
    }
    return out;
  }

  private async create(input: Record<string, unknown>) {
    const d = await this.gql<{ issueCreate: { issue: LIssue } }>(`mutation Create($input: IssueCreateInput!) { issueCreate(input: $input) { issue { ${ISSUE_FIELDS} } } }`, {
      input: { teamId: this.o.teamId, ...(this.o.projectId ? { projectId: this.o.projectId } : {}), ...input },
    });
    return d.issueCreate.issue;
  }

  private async update(id: string, input: Record<string, unknown>) {
    await this.gql(`mutation Update($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`, { id, input });
  }

  private async postComment(issueId: string, body: string) {
    const d = await this.gql<{ commentCreate: { comment: { id: string } } }>(`mutation Comment($input: CommentCreateInput!) { commentCreate(input: $input) { comment { id } } }`, { input: { issueId, body } });
    return d.commentCreate.comment.id;
  }

  protected async remoteCreateMap(input: { title: string; sections: MapSections; mode: MapMode }): Promise<MapDoc> {
    const i = await this.create({ title: input.title, description: serializeMapBody(input.sections), labelIds: await this.labelIds(mapLabels(input.mode)) });
    return { id: i.id, key: i.identifier, title: i.title, mode: input.mode, sections: input.sections, createdAt: Date.parse(i.createdAt), updatedAt: Date.parse(i.updatedAt) };
  }

  protected async remoteCreateTicket(map: MapDoc, input: { title: string; type: TicketType; body: string; hitl?: boolean }): Promise<Ticket> {
    const i = await this.create({ title: input.title, description: input.body, parentId: map.id, labelIds: await this.labelIds(ticketLabels(input.type, input.hitl)) });
    return this.ticket(map.id, i, [], new Set());
  }

  protected async remoteAddBlocking(_map: MapDoc, blocker: Ticket, blocked: Ticket) {
    await this.gql(`mutation Block($input: IssueRelationCreateInput!) { issueRelationCreate(input: $input) { success } }`, {
      input: { issueId: blocker.id, relatedIssueId: blocked.id, type: 'blocks' },
    });
  }

  protected async remoteSetClaim(_map: MapDoc, t: Ticket) {
    await this.update(t.id, { description: joinBody(t.body, { assignee: t.assignee }) });
  }

  protected async remoteComment(_map: MapDoc, t: Ticket, author: string, body: string) {
    await this.postComment(t.id, authoredBody(author, body));
  }

  protected async remoteClose(_map: MapDoc, t: Ticket, reason: 'completed' | 'not_planned') {
    const m = await this.meta();
    const stateId = reason === 'completed' ? m.done : m.canceled || m.done;
    if (!stateId) throw new TrackerError('invalid', `Linear: team ${m.key} has no ${reason === 'completed' ? 'completed' : 'canceled'} state`);
    await this.update(t.id, { stateId });
  }

  protected async remoteUpdateMap(map: MapDoc) {
    await this.update(map.id, { description: serializeMapBody(map.sections) });
  }

  protected async remoteSetMode(map: MapDoc, mode: MapMode) {
    const ids = await this.labelIds([PLAN_ONLY_LABEL]);
    await this.update(map.id, mode === 'plan-only' ? { addedLabelIds: ids } : { removedLabelIds: ids });
  }

  protected async remotePostDecision(map: MapDoc, d: DecisionRecord, ticket?: Ticket) {
    this.decisionComments.set(`${map.id}/${d.id}`, await this.postComment(ticket?.id ?? map.id, decisionComment(d)));
  }

  protected async remoteUpdateDecision(map: MapDoc, d: DecisionRecord) {
    const id = this.decisionComments.get(`${map.id}/${d.id}`);
    if (!id) throw new TrackerError('not_found', `Linear: no comment holds decision ${d.id}`);
    await this.gql(`mutation EditComment($id: String!, $input: CommentUpdateInput!) { commentUpdate(id: $id, input: $input) { success } }`, { id, input: { body: decisionComment(d) } });
  }
}

/** Settings "Test connection": the key's user and teams, plus the projects of `teamId` when given. */
export async function testLinear(o: { apiKey: string; teamId?: string; apiUrl?: string } & HttpOptions): Promise<TrackerTestResult> {
  const http = new HttpClient(linear, { retries: 0, ...o });
  const gql = async <T,>(query: string, variables: Record<string, unknown> = {}) => {
    const r = await http.send<{ data?: T }>(o.apiUrl ?? DEFAULT_API, {
      method: 'POST',
      headers: { Authorization: authHeader(o.apiKey.trim()), 'Content-Type': 'application/json', 'User-Agent': BRAND.slug },
      body: JSON.stringify({ query, variables }),
    });
    const err = graphqlError('Linear', r.body);
    if (err) throw err;
    return r.body.data as T;
  };
  try {
    const d = await gql<{ viewer: { name: string }; organization: { name: string }; teams: { nodes: { id: string; key: string; name: string }[] } }>(
      `query Test { viewer { name } organization { name } teams(first: 50) { nodes { id key name } } }`,
    );
    const teams = d.teams.nodes;
    const team = teams.find((t) => t.id === o.teamId) ?? (teams.length === 1 ? teams[0] : undefined);
    let projects: { id: string; name: string }[] | undefined;
    if (team) {
      const p = await gql<{ team: { projects: { nodes: { id: string; name: string }[] } } }>(`query Projects($id: String!) { team(id: $id) { projects(first: 50) { nodes { id name } } } }`, { id: team.id });
      projects = p.team.projects.nodes;
    }
    return { ok: true, account: `${d.viewer.name} · ${d.organization.name}`, target: team ? `${team.key} · ${team.name}` : undefined, teams, projects, rate: http.rate };
  } catch (err) {
    return { ok: false, ...describeError(err, 'Linear') };
  }
}
