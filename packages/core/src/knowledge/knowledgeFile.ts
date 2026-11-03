import { arr, iso, parseFront, str, time, writeFront, type Front } from '../model/frontmatter';
import { isKind, KNOWLEDGE_STATUSES, type KnowledgeEntry } from './knowledge';

/** `knowledge/<id>.md`: frontmatter (kind, status, scope, tags, sources, anchors, author, times, flag) plus the body. */
export function serializeKnowledge(e: KnowledgeEntry): string {
  const front: Front = { title: e.title, kind: e.kind, status: e.status };
  if (e.scope.length) front.scope = e.scope;
  if (e.tags.length) front.tags = e.tags;
  if (e.sources.length) front.sources = e.sources;
  if (e.anchors.length) front.anchors = e.anchors.map((a) => (a.hash ? `${a.path}@${a.hash}` : a.path));
  front.createdBy = e.createdBy;
  front.created = iso(e.createdAt);
  front.updated = iso(e.updatedAt);
  if (e.flag) {
    front.flaggedBy = e.flag.by;
    front.flagged = iso(e.flag.at);
    front.flagReason = e.flag.reason;
  }
  return writeFront(front, e.body);
}

export function parseKnowledge(id: string, md: string): KnowledgeEntry {
  const { front, body } = parseFront(md);
  const kind = str(front.kind);
  const status = KNOWLEDGE_STATUSES.find((s) => s === str(front.status)) ?? 'suggested';
  return {
    id,
    title: str(front.title) || id,
    body: body.trim(),
    kind: isKind(kind) ? kind : 'fact',
    status,
    scope: arr(front.scope),
    tags: arr(front.tags),
    sources: arr(front.sources),
    anchors: arr(front.anchors).map((a) => {
      const i = a.lastIndexOf('@');
      return i > 0 ? { path: a.slice(0, i), hash: a.slice(i + 1) } : { path: a };
    }),
    createdBy: str(front.createdBy) || 'operator',
    createdAt: time(front.created),
    updatedAt: time(front.updated),
    ...(front.flaggedBy
      ? { flag: { by: str(front.flaggedBy), reason: str(front.flagReason), at: time(front.flagged) } }
      : {}),
  };
}
