import { PLAN_ONLY_LABEL } from '../../model/brand';
import { parseMapBody } from '../../model/mapBody';
import { DEFAULT_MAP_MODE, type Comment, type DecisionRecord, type MapDoc } from '../../model/types';
import { parseDecisionComment, readComment, splitBody } from './format';

export interface MissionIssueParts {
  id: string;
  key: string;
  title: string;
  labels: string[];
  body: string | null | undefined;
  createdAt: string;
  updatedAt: string;
}

/** The mission issue as a map: plan-only by label, sections from the issue body. */
export function mapFromIssue(p: MissionIssueParts): MapDoc {
  return {
    id: p.id,
    key: p.key,
    title: p.title,
    mode: p.labels.includes(PLAN_ONLY_LABEL) ? 'plan-only' : DEFAULT_MAP_MODE,
    sections: parseMapBody(splitBody(p.body).text),
    createdAt: Date.parse(p.createdAt) || 0,
    updatedAt: Date.parse(p.updatedAt) || 0,
  };
}

export interface IssueComment<Id> {
  id: Id;
  body: string;
  author?: string;
  createdAt: string;
}

/** An issue's comments in order; decision records among them go to `onDecision` instead. */
export function readIssueComments<Id>(
  mapId: string,
  comments: IssueComment<Id>[],
  onDecision: (d: DecisionRecord, commentId: Id) => void,
): Comment[] {
  const out: Comment[] = [];
  for (const c of comments) {
    const d = parseDecisionComment(c.body);
    if (d) {
      onDecision({ ...d, mapId }, c.id);
      continue;
    }
    const parsed = readComment({ id: String(c.id), body: c.body, author: c.author, createdAt: c.createdAt });
    if (parsed) out.push(parsed);
  }
  return out;
}
