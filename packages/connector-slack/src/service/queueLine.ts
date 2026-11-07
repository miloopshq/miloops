import type { SlackContext } from './slackContext';

/** Adds a line to the trail's next notification message (flushed by `flushBatches`). */
export function queueLine(ctx: SlackContext, mapId: string, line: string) {
  const b = ctx.batches.get(mapId) ?? { lines: [], lastAt: 0 };
  b.lines.push(line);
  ctx.batches.set(mapId, b);
}
