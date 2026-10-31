export class Emitter<T> {
  private listeners = new Set<(v: T) => void>();

  on(fn: (v: T) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(v: T) {
    for (const l of [...this.listeners]) l(v);
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let counter = 0;
export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;
