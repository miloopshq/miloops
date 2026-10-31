/** Minimal synchronous key-value storage: `localStorage` in the browser, a JSON file in a CLI, a Map in tests and demo. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
}

/** The JSON value stored under `key`, or `fallback` when it is missing or unreadable. */
export function readStoredJson<T>(store: KeyValueStore, key: string, fallback: T): T {
  try {
    const raw = store.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
