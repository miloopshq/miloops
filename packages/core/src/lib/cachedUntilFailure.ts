/** Calls `fn` once and shares its promise; a rejection clears it so the next call tries again. */
export function cachedUntilFailure<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () =>
    (pending ??= fn().catch((e) => {
      pending = undefined;
      throw e;
    }));
}
