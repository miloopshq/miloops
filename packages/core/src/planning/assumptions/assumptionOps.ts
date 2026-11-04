import type { TrackerAdapter } from '../../adapters/adapter';
import type { DiscoveryBrief } from '../../discovery/brief';
import type { Assumption, AssumptionInput } from '../../model/assumption';
import { idNumber } from '../../model/assumptionLine';
import { OperationError } from '../operations/operationError';

/**
 * Adds assumptions to a mission's Assumptions section with the next `S-<n>` ids. Inputs whose `source` or text is
 * already listed are skipped, so seeding twice (a brief accepted again) adds nothing. Returns the ones added.
 */
export async function addAssumptions(adapter: TrackerAdapter, mapId: string, inputs: AssumptionInput[]) {
  const snap = await adapter.loadMap(mapId);
  const current = snap.map.sections.assumptions ?? [];
  const sources = new Set(current.flatMap((a) => (a.source ? [a.source] : [])));
  const texts = new Set(current.map((a) => a.text.trim().toLowerCase()));
  let next = Math.max(0, ...current.map((a) => idNumber(a.id))) + 1;
  const added: Assumption[] = [];
  for (const input of inputs) {
    const text = input.text.trim();
    const seen = (input.source && sources.has(input.source)) || texts.has(text.toLowerCase());
    if (!text || seen) continue;
    texts.add(text.toLowerCase());
    added.push({
      id: `S-${next++}`,
      text,
      status: 'holding',
      tickets: input.tickets ?? [],
      ...(input.source ? { source: input.source } : {}),
    });
  }
  if (added.length) await adapter.updateMapSections(mapId, { assumptions: [...current, ...added] });
  return added;
}

/** The accepted brief's assumptions become the mission's, each sourced `brief:<A-n>`. */
export function seedFromBrief(adapter: TrackerAdapter, brief: Pick<DiscoveryBrief, 'mapId' | 'sections'>) {
  const inputs = brief.sections.assumptions.map((a) => ({ text: a.text, source: `brief:${a.id}` }));
  return addAssumptions(adapter, brief.mapId, inputs);
}

export interface Challenge {
  assumption: string;
  evidence: string;
  by: string;
  ticketId?: string;
  at?: number;
}

/**
 * Marks an assumption challenged, with the evidence. Returns it with the tickets and decisions that depend on it,
 * which a replan proposal should account for. Invalidated assumptions can't be challenged again.
 */
export async function challengeAssumption(adapter: TrackerAdapter, mapId: string, c: Challenge) {
  if (!c.evidence.trim()) throw new OperationError('"evidence" is required: what you found, with paths or output');
  const snap = await adapter.loadMap(mapId);
  const all = snap.map.sections.assumptions ?? [];
  const target = all.find((a) => a.id === c.assumption);
  if (!target) throw new OperationError(`unknown assumption ${c.assumption}`);
  if (target.status === 'invalidated') throw new OperationError(`${target.id} is already invalidated`);
  const challenge = { by: c.by, at: c.at ?? Date.now(), evidence: c.evidence.trim(), ticketId: c.ticketId };
  const updated: Assumption = { ...target, status: 'challenged', challenge };
  await adapter.updateMapSections(mapId, { assumptions: all.map((a) => (a.id === target.id ? updated : a)) });
  const decisions = (await adapter.listDecisions(mapId)).filter((d) => d.assumes?.includes(target.id));
  return { assumption: updated, tickets: target.tickets, decisions: decisions.map((d) => d.id) };
}

/** After the operator decides a replan: approved invalidates `ids`; rejected puts challenged ones back to holding. */
export async function settleAssumptions(
  adapter: TrackerAdapter,
  mapId: string,
  change: { ids: string[]; status: 'invalidated' | 'holding'; replanId: string },
) {
  if (!change.ids.length) return [];
  const snap = await adapter.loadMap(mapId);
  const all = snap.map.sections.assumptions ?? [];
  const hit = (a: Assumption) => change.ids.includes(a.id) && a.status !== 'invalidated';
  const settled = all.filter(hit).map((a) => ({ ...a, status: change.status, decidedBy: change.replanId }));
  if (!settled.length) return [];
  const byId = new Map(settled.map((a) => [a.id, a]));
  await adapter.updateMapSections(mapId, { assumptions: all.map((a) => byId.get(a.id) ?? a) });
  return settled;
}
