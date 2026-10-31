import type { Comment, DecisionRecord, MapSnapshot, Ticket } from '../../../model/types';
import { ticketFromIssue } from '../format';
import { mapFromIssue, readIssueComments } from '../issueMapping';
import type { GqlIssue } from './schema';

export interface GitHubMission {
  snap: MapSnapshot;
  decisions: DecisionRecord[];
  /** Issue number → REST id, for every issue read. */
  issueIds: [string, number][];
  /** `<mission>/<D-n>` → id of the comment holding the record. */
  decisionComments: [string, number][];
}

/** A mission issue (with its sub-issues, as `MISSION_QUERY` returns it) as a map snapshot. */
export function readMission(mapId: string, root: GqlIssue): GitHubMission {
  const decisions: DecisionRecord[] = [];
  const decisionComments: [string, number][] = [];
  const issueIds: [string, number][] = [[mapId, root.databaseId]];
  const comments = (issue: GqlIssue): Comment[] =>
    readIssueComments(
      mapId,
      issue.comments.nodes.map((c) => ({
        id: c.databaseId,
        body: c.body,
        author: c.author?.login,
        createdAt: c.createdAt,
      })),
      (d, commentId) => {
        decisions.push(d);
        decisionComments.push([`${mapId}/${d.id}`, commentId]);
      },
    );
  comments(root);
  const subs = root.subIssues?.nodes ?? [];
  const siblings = new Set(subs.map((s) => String(s.number)));
  const tickets: Ticket[] = subs.map((s) => {
    issueIds.push([String(s.number), s.databaseId]);
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
      comments: comments(s),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      closedAt: s.closedAt,
    });
  });
  const map = mapFromIssue({
    id: mapId,
    key: `#${root.number}`,
    title: root.title,
    labels: root.labels.nodes.map((l) => l.name),
    body: root.body,
    createdAt: root.createdAt,
    updatedAt: root.updatedAt,
  });
  return {
    snap: { map, tickets: tickets.sort((a, b) => a.createdAt - b.createdAt || Number(a.id) - Number(b.id)) },
    decisions,
    issueIds,
    decisionComments,
  };
}
