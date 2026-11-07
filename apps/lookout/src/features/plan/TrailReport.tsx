import {
  type ActivityState,
  type MapSnapshot,
  deliveryReport,
  deliveryToMarkdown,
  durationLabel,
} from '@teamtrail/core';
import { useMemo } from 'react';
import { Button, Empty } from '../../components/ui';
import { useJournal } from '../../hooks/useJournal';
import { download, usd } from '../../lib';

/** The trail report: outcomes, not just tokens. Every number says how it was computed (hover). */
export function TrailReport({
  snap,
  activity,
  onTicket,
}: {
  snap: MapSnapshot;
  activity: ActivityState;
  onTicket: (id: string) => void;
}) {
  const journal = useJournal(snap);
  const usage = activity.usageByMap[snap.map.id];
  const r = useMemo(
    () => deliveryReport({ snap, journal, answered: activity.answered, usage }),
    [snap, journal, activity.answered, usage],
  );
  const i = r.interventions;
  const stats: [string, string, string][] = [
    ['Done', `${r.done}`, `${r.done} done · ${r.cancelled} cancelled · ${r.open} open`],
    [
      'Lead time',
      durationLabel(r.trailLeadMs),
      'Trail lead time: from when the trail was charted to its last done ticket',
    ],
    ['Median ticket', durationLabel(r.medianLeadMs), "Median time from a ticket's first claim to done"],
    [
      'Interventions',
      `${i.total}`,
      `${i.answers} agent questions you answered + ${i.operatorActions} lifecycle calls you made (approve, send back, accept, unblock, cancel, release), of which ${i.reworkRequested} sent work back. Answers count while their sessions are on record.`,
    ],
    ['Rework', `${r.rework.cycles}`, `Times work went back to rework, on ${r.rework.tickets} tickets`],
    [
      'Reviews',
      `${r.reviews.passed}/${r.reviews.failed}`,
      `${r.reviews.passed} passed, ${r.reviews.failed} failed, ${r.reviews.needsHuman} needed you`,
    ],
    [
      'Cost / ticket',
      r.spend.perVerifiedTicketUsd === undefined ? '—' : usd(r.spend.perVerifiedTicketUsd),
      `Cost per verified ticket: trail spend ${usd(r.spend.costUsd)} ÷ ${r.done} done tickets`,
    ],
  ];
  return (
    <div className="report">
      <ul className="report-stats">
        {stats.map(([label, value, how]) => (
          <li key={label} data-tip={how}>
            <span className="mono-label">{label}</span>
            <b>{value}</b>
          </li>
        ))}
      </ul>
      <div className="report-bar">
        <span className="mono-label">Tickets</span>
        <Button
          size="sm"
          variant="ghost"
          data-tip="Download this report as markdown"
          onClick={() =>
            download(`${snap.map.key.replace('#', 'trail-')}-report.md`, deliveryToMarkdown(r, snap.map.title))
          }
        >
          Export markdown
        </Button>
      </div>
      {r.tickets.length ? (
        <ul className="list report-tickets">
          {r.tickets.map((t) => (
            <li key={t.id} className={`out-${t.outcome}`}>
              <button
                onClick={() => onTicket(t.id)}
                data-tip={`${t.outcome} · rework ${t.reworks} · reviews ${t.reviews.passed}/${t.reviews.failed} · your calls ${t.operatorActions}`}
              >
                <span className="key">{t.key}</span>
                <span className="ttl">{t.title}</span>
                <span className="lead">{t.outcome === 'done' ? durationLabel(t.leadMs) : t.outcome}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No tickets yet</Empty>
      )}
    </div>
  );
}
