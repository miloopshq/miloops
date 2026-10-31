/** Runs tasks one after another per key, in call order; a failed task does not block the next one. */
export class KeyedLock {
  private tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    this.tails.set(key, next);
    void next.finally(() => this.tails.get(key) === next && this.tails.delete(key)).catch(() => {});
    return next;
  }
}
