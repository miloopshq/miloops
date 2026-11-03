import type { KnowledgeEntry } from '../../knowledge/knowledge';
import type { AttentionSource, Candidate } from '../types';
import { clip } from './clip';

function flagged(e: KnowledgeEntry): Candidate | undefined {
  if (!e.flag || e.status === 'outdated') return undefined;
  return {
    kind: 'knowledge',
    mapId: '',
    title: clip(`${e.id} ${e.title}: flagged by ${e.flag.by}`),
    since: e.flag.at,
    urgency: 'soon',
    ref: e.id,
    agent: e.flag.by,
    holds: [],
    notes: [clip(e.flag.reason, 120)],
    batchKey: 'knowledge',
  };
}

function suggested(e: KnowledgeEntry): Candidate | undefined {
  if (e.status !== 'suggested' || e.flag) return undefined;
  return {
    kind: 'knowledge',
    mapId: '',
    title: clip(`Review suggested knowledge ${e.id}: ${e.title}`),
    since: e.createdAt,
    urgency: 'fyi',
    ref: e.id,
    agent: e.createdBy,
    holds: [],
    batchKey: 'knowledge',
  };
}

/** Knowledge waiting for the operator: suggestions to confirm, and entries an agent flagged as wrong. */
export const knowledgeSource: AttentionSource = {
  kind: 'knowledge',
  collect({ knowledge }) {
    return knowledge.flatMap((e) => flagged(e) ?? suggested(e) ?? []);
  },
};
