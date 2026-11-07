import { type PerformanceRow, durationLabel } from '@teamtrail/core';
import { Empty, MetaLine, Row } from '../../components/ui';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One agent, vendor or ticket type per row: the median lead time, then the counts behind it. */
export function PerformanceRows({ rows }: { rows: PerformanceRow[] }) {
  if (!rows.length) return <Empty>No claimed tickets yet</Empty>;
  return (
    <ul className="perf-rows">
      {rows.map((r) => (
        <Row
          key={r.key}
          as="li"
          className="perf-row"
          title={r.key}
          trailing={<span title="Median time from first claim to done">{durationLabel(r.medianLeadMs)}</span>}
          context={
            <MetaLine
              parts={[
                `${r.done} of ${plural(r.tickets, 'ticket')} done`,
                r.cancelled > 0 && `${r.cancelled} cancelled`,
                plural(r.reworkCycles, 'rework'),
                `reviews ${r.reviews.passed} passed, ${r.reviews.failed} failed`,
                r.answers > 0 && plural(r.answers, 'question'),
              ]}
            />
          }
          detail={
            r.findings.raised > 0
              ? `As reviewer: ${r.findings.upheld} of ${plural(r.findings.raised, 'finding')} upheld`
              : undefined
          }
        />
      ))}
    </ul>
  );
}
