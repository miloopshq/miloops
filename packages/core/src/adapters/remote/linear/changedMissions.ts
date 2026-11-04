import { MAP_LABEL } from '../../../model/brand';
import type { LChanges } from './schema';

/**
 * The missions a batch of changed issues and comments touches, or `all` when a mission this run doesn't know yet
 * changed (it needs a full resync). `known` maps an issue id to its mission.
 */
export function changedMissions(d: LChanges, known: (ref: string) => string | undefined): string[] | 'all' {
  const refs = [
    ...d.issues.nodes.map((i) => ({ id: i.id, parent: i.parent?.id, labels: i.labels.nodes.map((l) => l.name) })),
    ...d.comments.nodes
      .filter((c) => c.issue)
      .map((c) => ({ id: c.issue!.id, parent: c.issue!.parent?.id, labels: [] as string[] })),
  ];
  const out: string[] = [];
  for (const r of refs) {
    const mission = known(r.id) ?? (r.parent ? known(r.parent) : undefined);
    if (mission) out.push(mission);
    else if (r.labels.includes(MAP_LABEL)) return 'all';
  }
  return out;
}
