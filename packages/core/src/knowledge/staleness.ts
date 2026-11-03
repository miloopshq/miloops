import type { KnowledgeEntry } from './knowledge';

/**
 * Anchored files that changed (or vanished) since the entry was confirmed. `hashOf` returns a file's current git
 * blob hash, or undefined when it's gone. Anchors without a recorded hash, and entries without anchors, never go stale.
 */
export function staleAnchors(e: Pick<KnowledgeEntry, 'anchors'>, hashOf: (path: string) => string | undefined) {
  return e.anchors.filter((a) => a.hash && hashOf(a.path) !== a.hash).map((a) => a.path);
}

/** The entry with every anchor's hash set to the file's current one (on confirm or edit). */
export function withCurrentHashes<T extends Pick<KnowledgeEntry, 'anchors'>>(
  e: T,
  hashOf: (path: string) => string | undefined,
): T {
  return {
    ...e,
    anchors: e.anchors.map((a) => ({ path: a.path, ...(hashOf(a.path) ? { hash: hashOf(a.path) } : {}) })),
  };
}

/** Paths worth matching knowledge against, from free text: backticked paths and `dir/file.ext` tokens. */
const PATH_RE = new RegExp('`([^`\\s]+/[^`\\s]+)`|(?:^|[\\s(])/?((?:[\\w.-]+/)+[\\w.-]+)', 'gm');

export function pathsIn(text: string) {
  const found = new Set<string>();
  for (const m of text.matchAll(PATH_RE)) found.add((m[1] ?? m[2]).replace(/^\.?\//, '').replace(/[.,;:]+$/, ''));
  return [...found];
}
