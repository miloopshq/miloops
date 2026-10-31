import type { MapSnapshot } from '../../model/types';
import type { TrackerAdapter } from '../adapter';
import { demoSnapshot } from './demoSnapshot';
import { seedDecisions } from './seedDecisions';

/**
 * Recreate a snapshot through tracker primitives (ids/keys are reassigned by
 * the tracker). Used to load the sample map into a real tracker.
 */
export async function seedSnapshot(adapter: TrackerAdapter, demo: MapSnapshot = demoSnapshot()) {
  const map = await adapter.createMap({
    title: demo.map.title,
    mode: demo.map.mode,
    sections: { ...demo.map.sections, decisions: [], outOfScope: [] },
  });
  const ids = new Map<string, string>();
  for (const t of demo.tickets) {
    const created = await adapter.createTicket(map.id, {
      title: t.title,
      type: t.type,
      hitl: t.hitl,
      body: t.body.replace(demo.map.key, map.key),
    });
    ids.set(t.id, created.id);
  }
  for (const t of demo.tickets)
    for (const b of t.blockedBy) await adapter.addBlocking(map.id, ids.get(b)!, ids.get(t.id)!);
  for (const t of demo.tickets) {
    const id = ids.get(t.id)!;
    for (const c of t.comments) await adapter.comment(map.id, id, c.author, c.body);
    if (t.assignee) await adapter.assign(map.id, id, t.assignee);
    if (t.state === 'closed') await adapter.close(map.id, id, t.closeReason ?? 'completed');
  }
  const loaded = (await adapter.loadMap(map.id)).tickets;
  const keys = new Map(loaded.map((t) => [t.id, t.key]));
  const rekey = (s: string) =>
    s.replace(/#\d+/g, (k) => {
      const old = demo.tickets.find((t) => t.key === k);
      return old ? (keys.get(ids.get(old.id)!) ?? k) : k;
    });
  await adapter.updateMapSections(map.id, {
    decisions: demo.map.sections.decisions.map((d) => ({
      ...d,
      ticketId: d.ticketId && ids.get(d.ticketId),
      ticketKey: d.ticketId && keys.get(ids.get(d.ticketId)!),
    })),
    outOfScope: demo.map.sections.outOfScope.map(rekey),
  });
  await seedDecisions(adapter, map.id, demo, (oldId) => {
    const id = ids.get(oldId);
    return id ? { id, key: keys.get(id)! } : undefined;
  });
  return map;
}
