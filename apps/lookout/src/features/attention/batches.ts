import type { AttentionItem, AttentionKind } from '@teamtrail/core';

export interface Batch {
  key: string;
  kind: AttentionKind;
  mapId: string;
  items: AttentionItem[];
}

/** The ranked queue keeps each batch together; this cuts it into those runs, in order. */
export function batches(items: AttentionItem[]): Batch[] {
  const out: Batch[] = [];
  for (const item of items) {
    const last = out.at(-1);
    if (last?.key === item.batchKey) last.items.push(item);
    else out.push({ key: item.batchKey, kind: item.kind, mapId: item.mapId, items: [item] });
  }
  return out;
}
