import type { DecisionRecord, MapSnapshot, Ticket } from '../../../model/types';
import { ticketFromIssue } from '../format';
import { mapFromIssue, readIssueComments } from '../issueMapping';
import { isClosed, type LIssue } from './schema';

/** Receives each decision record found in comments, with the id of its comment. */
export type DecisionFound = (d: DecisionRecord, commentId: string) => void;

const comments = (mapId: string, issue: LIssue, found: DecisionFound) =>
  readIssueComments(
    mapId,
    [...issue.comments.nodes]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => ({ id: c.id, body: c.body, author: c.user?.displayName, createdAt: c.createdAt })),
    found,
  );

/** A sub-issue as a ticket; `siblings` are the mission's other sub-issues, the only blockers that count. */
export function linearTicket(mapId: string, i: LIssue, siblings: Set<string>, found: DecisionFound): Ticket {
  return ticketFromIssue({
    id: i.id,
    key: i.identifier,
    title: i.title,
    labels: i.labels.nodes.map((l) => l.name),
    body: i.description,
    closed: isClosed(i.state),
    closeReason: i.state.type === 'canceled' ? 'not_planned' : 'completed',
    trackerAssignee: i.assignee?.displayName,
    blockedBy: (i.inverseRelations?.nodes ?? [])
      .filter((r) => r.type === 'blocks' && siblings.has(r.issue.id))
      .map((r) => r.issue.id),
    comments: comments(mapId, i, found),
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    closedAt: i.completedAt ?? i.canceledAt,
  });
}

/** A mission issue (with its children, as `MISSION_QUERY` returns it) as a map snapshot. */
export function readMission(
  mapId: string,
  root: LIssue,
  found: DecisionFound,
): { snap: MapSnapshot; decisions: DecisionRecord[] } {
  const decisions: DecisionRecord[] = [];
  const collect: DecisionFound = (d, commentId) => {
    decisions.push(d);
    found(d, commentId);
  };
  comments(mapId, root, collect);
  const kids = root.children?.nodes ?? [];
  const siblings = new Set(kids.map((k) => k.id));
  const map = mapFromIssue({
    id: root.id,
    key: root.identifier,
    title: root.title,
    labels: root.labels.nodes.map((l) => l.name),
    body: root.description,
    createdAt: root.createdAt,
    updatedAt: root.updatedAt,
  });
  const tickets = kids.map((k) => linearTicket(mapId, k, siblings, collect)).sort((a, b) => a.createdAt - b.createdAt);
  return { snap: { map, tickets }, decisions };
}
