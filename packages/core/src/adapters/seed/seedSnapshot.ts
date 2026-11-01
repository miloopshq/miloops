import type { MapSnapshot } from '../../model/types';
import type { TrackerAdapter } from '../adapter';
import { sampleSnapshot } from './sampleSnapshot';
import { seedDecisions } from './seedDecisions';

/**
 * Recreate a snapshot through tracker primitives (ids/keys are reassigned by
 * the tracker). Used to load the sample map into a real tracker.
 */
export async function seedSnapshot(adapter: TrackerAdapter, sample: MapSnapshot = sampleSnapshot()) {
  const map = await adapter.createMap({
    title: sample.map.title,
    mode: sample.map.mode,
    sections: { ...sample.map.sections, decisions: [], outOfScope: [] },
  });
  const ids = new Map<string, string>();
  for (const t of sample.tickets) {
    const created = await adapter.createTicket(map.id, {
      title: t.title,
      type: t.type,
      hitl: t.hitl,
      body: t.body.replace(sample.map.key, map.key),
    });
    ids.set(t.id, created.id);
  }
  for (const t of sample.tickets)
    for (const b of t.blockedBy) await adapter.addBlocking(map.id, ids.get(b)!, ids.get(t.id)!);
  for (const t of sample.tickets) {
    const id = ids.get(t.id)!;
    for (const c of t.comments) await adapter.comment(map.id, id, c.author, c.body);
    if (t.assignee) await adapter.assign(map.id, id, t.assignee);
    if (t.state === 'closed') await adapter.close(map.id, id, t.closeReason ?? 'completed');
  }
  const loaded = (await adapter.loadMap(map.id)).tickets;
  const keys = new Map(loaded.map((t) => [t.id, t.key]));
  const rekey = (s: string) =>
    s.replace(/#\d+/g, (k) => {
      const old = sample.tickets.find((t) => t.key === k);
      return old ? (keys.get(ids.get(old.id)!) ?? k) : k;
    });
  await adapter.updateMapSections(map.id, {
    decisions: sample.map.sections.decisions.map((d) => ({
      ...d,
      ticketId: d.ticketId && ids.get(d.ticketId),
      ticketKey: d.ticketId && keys.get(ids.get(d.ticketId)!),
    })),
    outOfScope: sample.map.sections.outOfScope.map(rekey),
  });
  await seedDecisions(adapter, map.id, sample, (oldId) => {
    const id = ids.get(oldId);
    return id ? { id, key: keys.get(id)! } : undefined;
  });
  return map;
}
