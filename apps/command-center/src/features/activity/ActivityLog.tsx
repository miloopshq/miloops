import type { ActivityState } from '@miloops-hq/core';
import { EmptyState, MiloMark } from '../../components/ui';
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
          <span className="t">{clock(e.at)}</span>
          <span className="src">
            {e.source === 'system' && <MiloMark variant="voice" size={10} />}
            {e.agent ?? e.source}
          </span>
          <span className="msg">
            {e.tag && <span className="tag">{e.tag} · </span>}
            {e.text}
          </span>
        </div>
      ))}
    </div>
  );
}
