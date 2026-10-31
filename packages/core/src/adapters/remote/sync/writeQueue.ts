import type { OutboxStore, QueuedWrite } from './types';

/** Writes waiting for the tracker, oldest first, saved to the outbox store after every change. */
export class WriteQueue {
  private writes: QueuedWrite[];

  constructor(
    private readonly store: OutboxStore | undefined,
    private readonly onSaveError: (message: string) => void,
  ) {
    this.writes = (store?.load() ?? []).map((w) => ({ ...w, verify: true }));
  }

  get length() {
    return this.writes.length;
  }

  get head(): QueuedWrite | undefined {
    return this.writes[0];
  }

  forMap(mapId: string) {
    return this.writes.filter((w) => w.mapId === mapId);
  }

  push(w: QueuedWrite) {
    this.writes.push(w);
    this.save();
  }

  shift() {
    this.writes.shift();
    this.save();
  }

  save() {
    try {
      this.store?.save(this.writes);
    } catch (err) {
      this.onSaveError(`Could not save queued writes: ${(err as Error).message}`);
    }
  }

  release() {
    this.store?.release();
  }
}
