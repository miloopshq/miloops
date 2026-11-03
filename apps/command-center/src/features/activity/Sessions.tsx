import {
  type MapSnapshot,
  type ActivityState,
  attention,
  usageDetail,
  sessionTokens,
  USAGE_SOURCE,
  type TicketLease,
} from '@miloops-hq/core';
import { Empty, Card, Pill, MiloMark } from '../../components/ui';
import { useNow } from '../../hooks';
import { type Selection, tokens, usd, hms, isRunning, heldLeases } from '../../lib';
import { LeasePill } from './LeasePill';

/** Who is working on what: agent sessions with live timers, plus claims without a session (e.g. teammates). */
export function Sessions({
  snap,
  activity,
  leases,
  onSelect,
  onOpenChat,
}: {
  snap?: MapSnapshot;
  activity: ActivityState;
  leases?: TicketLease[];
  onSelect: (s: Selection) => void;
  onOpenChat: (id: string) => void;
}) {
  const now = useNow(1000);
  const running = activity.sessions.filter(isRunning);
  const live = new Set(running.map((s) => s.ticketId));
  const held = heldLeases(leases, snap?.map.id);
  const claims = snap?.tickets.filter((t) => t.state === 'open' && t.assignee && !live.has(t.id)) ?? [];
  if (!running.length && !claims.length) return <Empty>No agent on a ticket</Empty>;
  return (
    <ul className="sessions-list">
      {running.map((s) => {
        const t = snap?.tickets.find((x) => x.id === s.ticketId);
        const att = t ? attention(t) : undefined;
        return (
          <li key={s.id} className={s.waitingOn ? 'waiting' : ''}>
            <Card
              as="button"
              tone={s.waitingOn ? 'urgent' : undefined}
              onClick={() => {
                if (t) onSelect({ kind: 'ticket', id: t.id });
                if (att === 'hitl') onOpenChat(s.id);
              }}
            >
              <span className="row">
                <span className="callsign">{s.agent}</span>
                {att && <Pill tone={att === 'hitl' ? 'fill' : undefined}>{att === 'hitl' ? 'HITL' : 'AFK'}</Pill>}
                <LeasePill lease={t && held.get(t.id)} now={now} />
                {s.usage && (
                  <span className="usage" title={usageDetail(s.usage)}>
                    {tokens(sessionTokens(s))} tok · {usd(s.usage.costUsd)}
                    {s.usage.source && (
                      <span className={`usage-src tag-${USAGE_SOURCE[s.usage.source].tag.toLowerCase()}`}>
                        {USAGE_SOURCE[s.usage.source].tag}
                      </span>
                    )}
                  </span>
                )}
                <span className="timer">{hms(now - s.startedAt)}</span>
              </span>
              <span className="segs">
                {Array.from({ length: s.total }, (_, i) => (
                  <i key={i} className={segmentClass(i + 1, s.step)} />
                ))}
              </span>
              <span className="row">
                {s.waitingOn ? (
                  <span className="urgent-text">
                    <MiloMark variant="alert" size={11} /> Waiting on you
                  </span>
                ) : (
                  <span className="dim">
                    {s.mode} · {s.stepLabel.toLowerCase()}
                  </span>
                )}
                <span className="tkt">{ticketLabel(t, s.mode)}</span>
              </span>
            </Card>
          </li>
        );
      })}
      {claims.map((t) => (
        <li key={t.id} className="claim">
          <Card as="button" onClick={() => onSelect({ kind: 'ticket', id: t.id })}>
            <span className="row">
              <span className="callsign">{t.assignee}</span>
              <Pill>claim</Pill>
              <LeasePill lease={held.get(t.id)} now={now} />
            </span>
            <span className="row">
              <span className="tkt">
                {t.key} {t.title}
              </span>
            </span>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** A step before the current one is done; the current one is highlighted. */
function segmentClass(n: number, step: number) {
  if (n < step) return 'done';
  if (n === step) return 'cur';
  return '';
}

function ticketLabel(t: { key: string; title: string } | undefined, mode: string) {
  if (t) return `${t.key} ${t.title}`;
  if (mode === 'chart') return 'Charting mission';
  return '';
}
