import { leaseHealth, type TicketLease } from '../agents/ticketLease';
import { globMatch } from '../knowledge/knowledge';

const WILD = /[*?[{]/;

/** The part of a glob before its first wildcard: `src/app/` for `src/app/**`, the whole path for a plain path. */
const literalOf = (g: string) => {
  const i = g.search(WILD);
  return (i === -1 ? g : g.slice(0, i)).replace(/^\.\//, '');
};

/**
 * Whether two path globs can name the same file. A plain path overlaps a glob that matches it; two globs
 * overlap when one's fixed prefix lies inside the other's (`src/**` and `src/app/*.ts`). Errs on the side of
 * warning: a warning costs a glance, a missed clash costs a merge.
 */
export function globsOverlap(a: string, b: string): boolean {
  const [la, lb] = [literalOf(a), literalOf(b)];
  const plainA = !WILD.test(a);
  const plainB = !WILD.test(b);
  if (plainA && plainB) return la === lb;
  if (plainA) return globMatch(b, la);
  if (plainB) return globMatch(a, lb);
  return la.startsWith(lb) || lb.startsWith(la);
}

export interface TouchOverlap {
  mapId: string;
  ticketId: string;
  ticketKey: string;
  agent: string;
  /** Pairs of (mine, theirs) globs that overlap. */
  pairs: [string, string][];
}

/** Other live claims whose declared files overlap `touches`. Deterministic: claims in key order, pairs in order. */
export function touchOverlaps(
  mine: { mapId: string; ticketId: string; touches: string[] },
  leases: TicketLease[],
  now = Date.now(),
): TouchOverlap[] {
  return leases
    .filter((l) => !l.returned && l.ticketId !== mine.ticketId && l.touches?.length)
    .filter((l) => leaseHealth(l, now) !== 'expired')
    .map((l) => ({
      mapId: l.mapId,
      ticketId: l.ticketId,
      ticketKey: l.ticketKey,
      agent: l.agent,
      pairs: mine.touches.flatMap((a) =>
        (l.touches ?? []).filter((b) => globsOverlap(a, b)).map((b): [string, string] => [a, b]),
      ),
    }))
    .filter((o) => o.pairs.length)
    .sort((x, y) => x.ticketKey.localeCompare(y.ticketKey, undefined, { numeric: true }));
}

/** "src/app/** and src/app/main.js" for the first pair, "+2 more" after it. */
export function pairsLabel(pairs: [string, string][]) {
  const [a, b] = pairs[0];
  const first = a === b ? a : `${a} and ${b}`;
  return pairs.length > 1 ? `${first} (+${pairs.length - 1} more)` : first;
}
