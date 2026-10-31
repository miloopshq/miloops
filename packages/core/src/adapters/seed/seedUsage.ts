import type { UsageLedger } from '../../activity/usageLedger';
import type { MapSnapshot, TicketType } from '../../model/types';
import { demoSnapshot } from './demoSnapshot';

/**
 * Usage the sample mission's past sessions reported, written into the ledger
 * at the times those sessions ran (charting, then each decided ticket).
 */
export function seedUsage(ledger: UsageLedger, demo: MapSnapshot = demoSnapshot()) {
  const rate = (i: number, o: number) => ({ inputTokens: i, outputTokens: o, costUsd: i * (3 / 1e6) + o * (15 / 1e6) });
  ledger.add(demo.map.id, rate(212_400, 13_900), 'seed-s-chart', demo.map.createdAt + 600_000);
  const tokens: Partial<Record<TicketType, [number, number]>> = {
    research: [386_000, 21_700],
    grilling: [148_500, 9_300],
    prototype: [522_000, 38_400],
  };
  for (const t of demo.tickets) {
    const k = tokens[t.type];
    if (!k || t.closeReason !== 'completed' || !t.closedAt) continue;
    ledger.add(demo.map.id, rate(k[0], k[1]), `seed-s-${t.key.slice(1)}`, t.closedAt - 900_000);
  }
}
