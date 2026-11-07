import type { DeliveryReport } from './delivery';

/** Whole minutes, hours past 90 min, days past 48 h. */
export function durationLabel(ms?: number) {
  if (ms === undefined) return '—';
  const min = Math.round(ms / 60_000);
  if (min < 90) return `${min} min`;
  const h = ms / 3_600_000;
  return h < 48 ? `${Math.round(h * 10) / 10} h` : `${Math.round((h / 24) * 10) / 10} d`;
}

const usd = (n?: number) => (n === undefined ? '—' : `$${n.toFixed(n < 1 ? 4 : 2)}`);

/** The trail report as markdown, for sharing or keeping with the repo. */
export function deliveryToMarkdown(r: DeliveryReport, title: string, at = Date.now()) {
  const i = r.interventions;
  const lines = [
    `# Trail report: ${title}`,
    '',
    `_Generated ${new Date(at).toISOString()} by Teamtrail._`,
    '',
    '| Measure | Value |',
    '| --- | --- |',
    `| Tickets done / cancelled / open | ${r.done} / ${r.cancelled} / ${r.open} |`,
    `| Trail lead time (created → last done) | ${durationLabel(r.trailLeadMs)} |`,
    `| Median ticket lead time (claim → done) | ${durationLabel(r.medianLeadMs)} |`,
    `| Human interventions | ${i.total} (${i.answers} answers, ${i.operatorActions} operator actions, ${i.reworkRequested} sent back) |`,
    `| Rework | ${r.rework.cycles} cycles on ${r.rework.tickets} tickets |`,
    `| Reviews | ${r.reviews.passed} passed, ${r.reviews.failed} failed, ${r.reviews.needsHuman} needed a human |`,
    `| Spend | ${usd(r.spend.costUsd)} · ${r.spend.tokens.toLocaleString('en-US')} tokens |`,
    `| Cost per verified ticket | ${usd(r.spend.perVerifiedTicketUsd)} |`,
    '',
    '## Tickets',
    '',
    '| Ticket | Type | Outcome | Lead time | Rework | Reviews (pass/fail) | Operator actions |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...r.tickets.map(
      (t) =>
        `| ${t.key} ${t.title.replace(/\|/g, '\\|')} | ${t.type} | ${t.outcome} | ${durationLabel(t.leadMs)} | ${t.reworks} | ${t.reviews.passed}/${t.reviews.failed} | ${t.operatorActions} |`,
    ),
    '',
  ];
  return lines.join('\n');
}
