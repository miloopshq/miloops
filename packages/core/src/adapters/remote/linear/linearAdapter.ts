import { cachedUntilFailure } from '../../../lib/cachedUntilFailure';
import { MAP_LABEL, PLAN_ONLY_LABEL } from '../../../model/brand';
import type {
  DecisionRecord,
  MapDoc,
  MapMode,
  MapSnapshot,
  MapSummary,
  Ticket,
  TicketType,
} from '../../../model/types';
import type { MapInput } from '../../adapter';
import { authoredBody, decisionComment, joinBody, mapLabels, mapBody, ticketLabels, ticketMeta } from '../format';
import { HttpClient, TrackerError, linear, type HttpOptions } from '../http';
import { SyncedAdapter } from '../sync/syncedAdapter';
import type { SyncOptions } from '../sync/types';
import { linearGql, type LinearGql } from './linearGql';
import { fetchLinearTeam } from './linearTeam';
import { linearTicket, readMission, type DecisionFound } from './readMission';
import { CHANGES_QUERY, ISSUE_FIELDS, MISSION_QUERY, type LChanges, type LIssue } from './schema';

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

export class LinearAdapter extends SyncedAdapter {
  readonly kind = 'linear' as const;
  readonly label = 'Linear';
  location: string;
  private http: HttpClient;
  private gql: LinearGql;
  private decisionComments = new Map<string, string>();
  private cursor?: string;
  private found: DecisionFound = (d, commentId) => this.decisionComments.set(`${d.mapId}/${d.id}`, commentId);

  constructor(private o: LinearOptions) {
    super({ pollMs: 12_000, ...o });
    this.http = new HttpClient(linear, o);
    this.gql = linearGql(this.http, o.apiKey, o.apiUrl);
    this.location = o.display ?? o.teamId;
  }

  protected rate() {
    return this.http.rate;
  }

  /** Team states and MILOOPS labels, creating missing labels once. */
  private meta = cachedUntilFailure(async () => {
    const team = await fetchLinearTeam(this.gql, this.o.teamId);
    if (!this.o.display) this.location = team.key;
    return team;
  });

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

  protected async fetchMap(mapId: string): Promise<{ snap: MapSnapshot; decisions: DecisionRecord[] }> {
    const d = await this.gql<{ issue: LIssue | null }>(MISSION_QUERY, { id: mapId });
    const root = d.issue;
    if (!root || !root.labels.nodes.some((l) => l.name === MAP_LABEL))
      throw new TrackerError('not_found', `Linear: ${mapId} is not a mission`);
    return readMission(mapId, root, this.found);
  }

  protected async changedSince(known: (ref: string) => string | undefined): Promise<string[] | 'all'> {
    if (this.cursor === undefined) {
      this.cursor = new Date(this.now()).toISOString();
      return 'all';
    }
    const since = this.cursor;
    const d = await this.gql<LChanges>(CHANGES_QUERY, {
      issues: { team: { id: { eq: this.o.teamId } }, updatedAt: { gt: since } },
      comments: { updatedAt: { gt: since }, issue: { team: { id: { eq: this.o.teamId } } } },
    });
    const stamps = [...d.issues.nodes.map((i) => i.updatedAt), ...d.comments.nodes.map((c) => c.updatedAt)];
    this.cursor = stamps.reduce((m, s) => (s > m ? s : m), since);
    const out: string[] = [];
    const refs = [
      ...d.issues.nodes.map((i) => ({ id: i.id, parent: i.parent?.id, labels: i.labels.nodes.map((l) => l.name) })),
      ...d.comments.nodes
        .filter((c) => c.issue)
        .map((c) => ({ id: c.issue!.id, parent: c.issue!.parent?.id, labels: [] as string[] })),
    ];
    for (const r of refs) {
      const mission = known(r.id) ?? (r.parent ? known(r.parent) : undefined);
      if (mission) out.push(mission);
      else if (r.labels.includes(MAP_LABEL)) return 'all';
    }
    return out;
  }

  private async create(input: Record<string, unknown>) {
    const d = await this.gql<{ issueCreate: { issue: LIssue } }>(
      `mutation Create($input: IssueCreateInput!) { issueCreate(input: $input) { issue { ${ISSUE_FIELDS} } } }`,
      {
        input: { teamId: this.o.teamId, ...(this.o.projectId ? { projectId: this.o.projectId } : {}), ...input },
      },
    );
    return d.issueCreate.issue;
  }

  private async update(id: string, input: Record<string, unknown>) {
    await this.gql(
      `mutation Update($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`,
      { id, input },
    );
  }

  private async postComment(issueId: string, body: string) {
    const d = await this.gql<{ commentCreate: { comment: { id: string } } }>(
      `mutation Comment($input: CommentCreateInput!) { commentCreate(input: $input) { comment { id } } }`,
      { input: { issueId, body } },
    );
    return d.commentCreate.comment.id;
  }

  protected async remoteCreateMap(input: MapInput & { mode: MapMode }): Promise<MapDoc> {
    const i = await this.create({
      title: input.title,
      description: mapBody(input),
      labelIds: await this.labelIds(mapLabels(input.mode)),
    });
    return {
      id: i.id,
      key: i.identifier,
      title: i.title,
      mode: input.mode,
      ...(input.verification ? { verification: input.verification } : {}),
      sections: input.sections,
      createdAt: Date.parse(i.createdAt),
      updatedAt: Date.parse(i.updatedAt),
    };
  }

  protected async remoteCreateTicket(
    map: MapDoc,
    input: { title: string; type: TicketType; body: string; hitl?: boolean },
  ): Promise<Ticket> {
    const i = await this.create({
      title: input.title,
      description: input.body,
      parentId: map.id,
      labelIds: await this.labelIds(ticketLabels(input.type, input.hitl)),
    });
    return linearTicket(map.id, i, new Set(), this.found);
  }

  protected async remoteAddBlocking(_map: MapDoc, blocker: Ticket, blocked: Ticket) {
    await this.gql(
      `mutation Block($input: IssueRelationCreateInput!) { issueRelationCreate(input: $input) { success } }`,
      {
        input: { issueId: blocker.id, relatedIssueId: blocked.id, type: 'blocks' },
      },
    );
  }

  protected async remoteSetMeta(_map: MapDoc, t: Ticket) {
    await this.update(t.id, { description: joinBody(t.body, ticketMeta(t)) });
  }

  protected async remoteComment(_map: MapDoc, t: Ticket, author: string, body: string, writeId: string) {
    await this.postComment(t.id, authoredBody(author, body, writeId));
  }

  protected async remoteClose(_map: MapDoc, t: Ticket, reason: 'completed' | 'not_planned') {
    const m = await this.meta();
    const stateId = reason === 'completed' ? m.done : m.canceled || m.done;
    if (!stateId)
      throw new TrackerError(
        'invalid',
        `Linear: team ${m.key} has no ${reason === 'completed' ? 'completed' : 'canceled'} state`,
      );
    await this.update(t.id, { stateId });
  }

  protected async remoteUpdateMap(map: MapDoc) {
    await this.update(map.id, { description: mapBody(map) });
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
    await this.gql(
      `mutation EditComment($id: String!, $input: CommentUpdateInput!) { commentUpdate(id: $id, input: $input) { success } }`,
      { id, input: { body: decisionComment(d) } },
    );
  }
}
