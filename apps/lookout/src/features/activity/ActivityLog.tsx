import type { ActivityState } from '@teamtrail/core';
import { EmptyState, ScoutBadge } from '../../components/ui';
import { clock } from '../../lib';

/** Dense activity log: time, source, message. */
export function ActivityLog({ activity, onTicket }: { activity: ActivityState; onTicket: (id: string) => void }) {
  const rows = activity.feed.slice(-120).reverse();
  if (!rows.length)
    return (
      <EmptyState
        title="Nothing has happened yet"
        hint="Claims, steps, questions and decisions appear here as agents work."
      />
    );
  return (
    <div className="log">
      {rows.map((e) => (
        <div
          key={e.id}
          className={`log-row lv-${e.level} src-${e.source} ${e.signal ? 'signal' : ''}`}
          onClick={() => e.ticketId && onTicket(e.ticketId)}
        >
          <span className="t t-meta">{clock(e.at)}</span>
          <span className="src t-meta">
            {e.source === 'system' && <ScoutBadge className="voice-badge" />}
            {e.agent ?? e.source}
          </span>
          <span className="msg">
            {e.tag && <span className="tag t-meta">{e.tag} · </span>}
            {e.text}
          </span>
        </div>
      ))}
    </div>
  );
}
