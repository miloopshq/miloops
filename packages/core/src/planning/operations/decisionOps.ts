import type { TrackerAdapter } from '../../adapters/adapter';
import type { DecisionInput, DecisionRecord } from '../../model/types';
import { OperationError } from './operationError';

/**
 * Record a decision (from any source: command center, agent, Slack, tracker import)
 * and, unless `appendToMission` is false, add `missionLine` (default: its summary) to the map's "Decisions so far".
 * Re-recording the same `source.kind` + `source.ref` returns the existing record.
 */
export async function recordDecision(adapter: TrackerAdapter, mapId: string, input: DecisionInput, opts: { appendToMission?: boolean; missionLine?: string } = {}) {
  if (input.source.ref) {
    const dup = (await adapter.listDecisions(mapId)).find((d) => d.source.kind === input.source.kind && d.source.ref === input.source.ref);
    if (dup) return dup;
  }
  const rec = await adapter.createDecision(mapId, input);
  if (opts.appendToMission ?? true) {
    const fresh = await adapter.loadMap(mapId);
    await adapter.updateMapSections(mapId, {
      decisions: [...fresh.map.sections.decisions, { ticketId: rec.ticketId, ticketKey: rec.ticketKey, text: opts.missionLine ?? rec.summary }],
    });
  }
  return rec;
}

/** Replace a decision: new record pointing back at the old one, old one marked superseded, mission line swapped. */
export async function supersedeDecision(
  adapter: TrackerAdapter,
  mapId: string,
  decisionId: string,
  input: Omit<DecisionInput, 'question' | 'supersedes'> & { question?: string },
): Promise<DecisionRecord> {
  const all = await adapter.listDecisions(mapId);
  const old = all.find((d) => d.id === decisionId);
  if (!old) throw new OperationError(`decision ${decisionId} not found`);
  if (old.supersededBy) throw new OperationError(`${old.id} is already superseded by ${old.supersededBy}`);
  const rec = await adapter.createDecision(mapId, {
    ticketId: old.ticketId,
    ticketKey: old.ticketKey,
    ...input,
    question: input.question ?? old.question,
    supersedes: old.id,
  });
  await adapter.markSuperseded(mapId, old.id, rec.id);
  const fresh = await adapter.loadMap(mapId);
  const ds = fresh.map.sections.decisions;
  const i = ds.findIndex((x) => x.text === old.summary || (!!old.ticketId && x.ticketId === old.ticketId) || (!!old.ticketKey && x.ticketKey === old.ticketKey));
  const line = { ticketId: rec.ticketId, ticketKey: rec.ticketKey, text: rec.summary };
  await adapter.updateMapSections(mapId, { decisions: i < 0 ? [...ds, line] : ds.map((x, j) => (j === i ? line : x)) });
  return rec;
}
