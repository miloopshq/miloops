import type { TrackerEvent } from '../../model/types';
import { parseDecision } from '../../planning/decisions/decisionFile';
import { DECISION_PATH } from './paths';

/**
 * Turns watcher hits from other writers into tracker events. An external decision
 * write also touches map.md, and watchers fire more than once per write, so changes
 * are batched per mission; a batch with decision files reports as decision events.
 */
export class ExternalChanges {
  /** Last seen text and supersededBy per decision file, to tell new records from supersessions and drop duplicate watcher hits. */
  private seen = new Map<string, { text: string; supersededBy?: string }>();
  private pending = new Map<string, { paths: Set<string>; timer: ReturnType<typeof setTimeout> }>();

  constructor(
    private read: (path: string) => Promise<string>,
    private emit: (e: TrackerEvent) => void,
  ) {}

  knows(path: string) {
    return this.seen.has(path);
  }

  remember(path: string, text: string, supersededBy?: string) {
    this.seen.set(path, { text, supersededBy });
  }

  queue(path: string) {
    const mapId = path.split('/')[0];
    const batch = this.pending.get(mapId) ?? { paths: new Set<string>(), timer: setTimeout(() => void this.flush(mapId), 250) };
    batch.paths.add(path);
    this.pending.set(mapId, batch);
  }

  private async flush(mapId: string) {
    const batch = this.pending.get(mapId);
    this.pending.delete(mapId);
    if (!batch) return;
    const decisionPaths = [...batch.paths].filter((p) => DECISION_PATH.test(p));
    const events: TrackerEvent[] = [];
    for (const p of decisionPaths) {
      const text = await this.read(p).catch(() => '');
      const prev = this.seen.get(p);
      if (!text || prev?.text === text) continue;
      const d = parseDecision(text);
      this.seen.set(p, { text, supersededBy: d.supersededBy });
      if (!prev) events.push({ kind: 'decision.recorded', mapId, decisionId: d.id, ticketId: d.ticketId, external: true, at: Date.now() });
      else if (d.supersededBy && d.supersededBy !== prev.supersededBy) events.push({ kind: 'decision.superseded', mapId, decisionId: d.id, supersededBy: d.supersededBy, external: true, at: Date.now() });
    }
    if (!decisionPaths.length) events.push({ kind: 'external.changed', mapId, at: Date.now() });
    else if (!events.length && decisionPaths.length < batch.paths.size) events.push({ kind: 'external.changed', mapId, at: Date.now() });
    // superseded events sort after the record that replaced them
    events.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'decision.recorded' ? -1 : 1));
    for (const e of events) this.emit(e);
  }
}
