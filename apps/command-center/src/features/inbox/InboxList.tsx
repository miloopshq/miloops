import type { PendingQuestion, MapSnapshot } from '@miloops-hq/core';
import { Empty, Card, Meta } from '../../components/ui';
import { useNow } from '../../hooks';
import { ago } from '../../lib';

/** How long a new decision request carries the dot-matrix "Incoming" signal. */
export const INCOMING_MS = 15_000;

export function InboxList(props: {
  items: PendingQuestion[];
  snaps: Record<string, MapSnapshot>;
  currentMapId?: string;
  selected?: string;
  onOpen: (sessionId: string, ticketId?: string) => void;
}) {
  const now = useNow(1000);
  if (!props.items.length) return <Empty>Nothing waiting</Empty>;
  const many = Object.keys(props.snaps).length > 1;
  return (
    <ul className="inbox-list">
      {props.items.map((q) => {
        const s = props.snaps[q.mapId];
        const t = s?.tickets.find((x) => x.id === q.ticketId);
        return (
          <li key={q.id} className={q.sessionId === props.selected ? 'sel' : ''}>
            <Card
              as="button"
              tone="urgent"
              on={q.sessionId === props.selected}
              onClick={() => props.onOpen(q.sessionId, q.ticketId)}
            >
              <span className="row1">
                <span className="who">{q.agent}</span>
                <span className="key">{t?.key}</span>
                {now - q.at < INCOMING_MS && <span className="signal-tag">Incoming</span>}
                <span className="age">{ago(now - q.at)}</span>
              </span>
              {many && (
                <Meta
                  className={`mission-tag ${q.mapId === props.currentMapId ? 'cur' : ''}`}
                  parts={[s?.map.title ?? q.mapId]}
                />
              )}
              <span className="ttl">{t?.title}</span>
              <span className="q t-title">{q.text.split('\n')[0]}</span>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
