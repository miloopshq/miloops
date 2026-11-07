import { readStoredJson, type KeyValueStore } from './keyValueStore';

/**
 * When the trail lead was last present, per trail. "Present" is decided by the
 * front end (tab visible and recently used); this only stores the times.
 */
export class Presence {
  private seen: Record<string, number>;
  constructor(
    private store: KeyValueStore,
    private key = 'presence',
  ) {
    this.seen = readStoredJson(store, key, {});
  }

  /** Copy of every trail's last-seen time. */
  snapshot(): Record<string, number> {
    return { ...this.seen };
  }

  lastSeen(mapId: string): number | undefined {
    return this.seen[mapId];
  }

  /** Latest time the trail lead was present in any trail; undefined on first run. */
  lastSeenAny(): number | undefined {
    const ts = Object.values(this.seen);
    return ts.length ? Math.max(...ts) : undefined;
  }

  markSeen(mapIds: string[], at = Date.now()) {
    let changed = false;
    for (const id of mapIds) {
      if ((this.seen[id] ?? 0) >= at) continue;
      this.seen[id] = at;
      changed = true;
    }
    if (changed) this.store.set(this.key, JSON.stringify(this.seen));
  }
}
