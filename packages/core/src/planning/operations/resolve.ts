import type { TrackerAdapter } from '../../adapters/adapter';
import type { Participant, DecisionSource, TranscriptEntry } from '../../model/types';
import { firstSentence } from '../decisions/decisionRecord';
import { recordDecision } from './decisionOps';
import { OperationError } from './operationError';

/** Audit fields a caller can attach when resolving; everything defaults from the ticket and author. */
export interface DecisionMeta {
  question?: string;
  alternatives?: string[];
  rationale?: string;
  /** Actor id of who made the call; defaults to the resolving author. */
  decidedBy?: string;
  participants?: Participant[];
  source?: DecisionSource;
  /** Kept on the record even when only a summary is posted to the ticket. */
  transcript?: TranscriptEntry[];
}

/** Resolve: resolution comment, close, decision record + line in the map's "Decisions so far". */
export async function resolve(
  adapter: TrackerAdapter,
  mapId: string,
  ticketId: string,
  input: {
    answer: string;
    author: string;
    summary?: string;
    transcript?: string;
    decision?: DecisionMeta;
    missionLine?: string;
  },
) {
  const snap = await adapter.loadMap(mapId);
  const t = snap.tickets.find((x) => x.id === ticketId);
  if (!t) throw new OperationError(`ticket ${ticketId} not found`);
  if (t.state === 'closed') throw new OperationError(`${t.key} is already closed`);
  if (input.transcript)
    await adapter.comment(mapId, ticketId, input.author, `**HITL transcript**\n\n${input.transcript}`);
  await adapter.comment(mapId, ticketId, input.author, `**Resolution**\n\n${input.answer}`);
  await adapter.close(mapId, ticketId, 'completed');
  const d = input.decision ?? {};
  await recordDecision(
    adapter,
    mapId,
    {
      ticketId: t.id,
      ticketKey: t.key,
      question: d.question ?? t.title,
      answer: input.answer,
      summary: input.summary ?? firstSentence(input.answer),
      alternatives: d.alternatives,
      rationale: d.rationale,
      decidedBy: d.decidedBy ?? input.author,
      participants: d.participants,
      source: d.source ?? { kind: 'agent', label: input.author },
      transcript: d.transcript,
    },
    { missionLine: input.missionLine },
  );
  return t;
}
