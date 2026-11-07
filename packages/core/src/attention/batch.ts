import type { AttentionItem } from '../model/attention';

/** Ties break by age, then id, so equal scores always come out in the same order. */
function byScore(a: AttentionItem, b: AttentionItem) {
  return b.score - a.score || a.since - b.since || a.id.localeCompare(b.id);
}

/**
 * Fewer questions are better: when one agent has several open questions in a trail, each one
 * loses 2 points per extra question (up to 10), and says so.
 */
function fewerQuestions(items: AttentionItem[]): AttentionItem[] {
  const count = new Map<string, number>();
  const key = (i: AttentionItem) => `${i.mapId}\u0000${i.agent}`;
  for (const i of items) if (i.kind === 'question') count.set(key(i), (count.get(key(i)) ?? 0) + 1);
  return items.map((i) => {
    const n = i.kind === 'question' ? (count.get(key(i)) ?? 1) : 1;
    if (n < 2) return i;
    return {
      ...i,
      score: i.score - Math.min(10, 2 * (n - 1)),
      reasons: [...i.reasons, `${n} questions from ${i.agent}`],
    };
  });
}

/**
 * Orders the queue so batches stay together: each batch ranks by its best item, and items inside a
 * batch by their own score. A batch of several says how many there are, so they're answered in one sitting.
 */
export function orderInBatches(items: AttentionItem[]): AttentionItem[] {
  const scored = fewerQuestions(items).sort(byScore);
  const groups = new Map<string, AttentionItem[]>();
  for (const i of scored) groups.set(i.batchKey, [...(groups.get(i.batchKey) ?? []), i]);
  return [...groups.values()].flatMap((group) => {
    if (group.length < 2) return group;
    return group.map((i) => ({ ...i, reasons: [...i.reasons, `answer together with ${group.length - 1} more`] }));
  });
}
