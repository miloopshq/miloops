import { durationLabel } from './deliveryMarkdown';
import type { PerformanceReport, PerformanceRow } from './performance';

/** A plain observation from the numbers. Information only: nothing is routed from it. */
export interface Recommendation {
  id: string;
  text: string;
  /** How it was worked out, in words. */
  because: string;
}

/** Below this, a difference is more likely luck than a pattern. */
export const MIN_SAMPLE = 5;
const MIN_RATIO = 1.5;
const MIN_POINTS = 15;

const pct = (n: number) => Math.round(n * 100);

function reviewFindings(rows: PerformanceRow[]): Recommendation[] {
  const enough = rows
    .filter((r) => r.findings.raised >= MIN_SAMPLE)
    .sort(
      (a, b) =>
        b.findings.upheld / b.findings.raised - a.findings.upheld / a.findings.raised || a.key.localeCompare(b.key),
    );
  if (enough.length < 2) return [];
  const [best, worst] = [enough[0], enough[enough.length - 1]];
  const [high, low] = [best.findings.upheld / best.findings.raised, worst.findings.upheld / worst.findings.raised];
  if (pct(high) - pct(low) < MIN_POINTS) return [];
  return [
    {
      id: 'review-findings',
      text: `${best.key} review findings upheld ${pct(high)}% vs ${worst.key} ${pct(low)}%`,
      because: `${best.findings.upheld} of ${best.findings.raised} and ${worst.findings.upheld} of ${worst.findings.raised} failed reviews stood; a finding is overruled when you accept the work anyway`,
    },
  ];
}

function rework(rows: PerformanceRow[]): Recommendation[] {
  const rate = (r: PerformanceRow) => r.reworkCycles / r.tickets;
  const enough = rows
    .filter((r) => r.tickets >= MIN_SAMPLE)
    .sort((a, b) => rate(a) - rate(b) || a.key.localeCompare(b.key));
  if (enough.length < 2) return [];
  const [best, worst] = [enough[0], enough[enough.length - 1]];
  if (rate(worst) - rate(best) < 0.2 || rate(worst) < rate(best) * MIN_RATIO) return [];
  return [
    {
      id: 'rework',
      text: `${worst.key} work goes back to rework more: ${rate(worst).toFixed(1)} times per ticket vs ${best.key} ${rate(best).toFixed(1)}`,
      because: `${worst.reworkCycles} cycles on ${worst.tickets} tickets, and ${best.reworkCycles} on ${best.tickets}`,
    },
  ];
}

function typeSpeed(type: string, rows: PerformanceRow[]): Recommendation[] {
  const lead = (r: PerformanceRow) => r.medianLeadMs ?? 0;
  const enough = rows
    .filter((r) => r.done >= MIN_SAMPLE && r.medianLeadMs !== undefined)
    .sort((a, b) => lead(a) - lead(b) || a.key.localeCompare(b.key));
  if (enough.length < 2) return [];
  const [fast, slow] = [enough[0], enough[enough.length - 1]];
  if (lead(slow) < lead(fast) * MIN_RATIO) return [];
  return [
    {
      id: `speed-${type}`,
      text: `${type} tickets: ${fast.key} is faster, ${durationLabel(fast.medianLeadMs)} vs ${slow.key} ${durationLabel(slow.medianLeadMs)}`,
      because: `Median first claim to done, over ${fast.done} and ${slow.done} done tickets`,
    },
  ];
}

/** Plain rules over the report. They speak only when both sides have at least {@link MIN_SAMPLE} results. */
export function performanceRecommendations(
  report: Pick<PerformanceReport, 'byVendor' | 'byTypeAndVendor'>,
): Recommendation[] {
  const types = Object.keys(report.byTypeAndVendor).sort();
  return [
    ...reviewFindings(report.byVendor),
    ...rework(report.byVendor),
    ...types.flatMap((type) => typeSpeed(type, report.byTypeAndVendor[type])),
  ];
}
