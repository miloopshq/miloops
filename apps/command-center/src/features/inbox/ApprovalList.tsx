import type { ApprovalItem, MapSnapshot } from '@miloops-hq/core';
import { Card, Meta } from '../../components/ui';
import { useNow } from '../../hooks';
import { ago } from '../../lib';

/** Verified work waiting on the operator: a reviewed pass to approve, or a held ticket to decide. */
export function ApprovalList(props: {
  items: ApprovalItem[];
  snaps: Record<string, MapSnapshot>;
  currentMapId?: string;
  onOpen: (mapId: string, ticketId: string) => void;
}) {
  const now = useNow(1000);
  if (!props.items.length) return null;
  const many = Object.keys(props.snaps).length > 1;
  return (
    <ul className="inbox-list approvals">
      {props.items.map((a) => (
        <li key={`${a.mapId}/${a.ticketId}`}>
          <Card as="button" tone="urgent" onClick={() => props.onOpen(a.mapId, a.ticketId)}>
            <span className="row1">
              <span className={`who ${a.kind}`}>{a.kind === 'approve' ? 'Approve' : 'Held'}</span>
              <span className="key">{a.ticketKey}</span>
              <span className="age">{ago(now - a.at)}</span>
            </span>
            {many && (
              <Meta
                className={`mission-tag ${a.mapId === props.currentMapId ? 'cur' : ''}`}
                parts={[props.snaps[a.mapId]?.map.title ?? a.mapId]}
              />
            )}
            <span className="ttl">{a.title}</span>
            <span className="q t-title">{a.reason}</span>
          </Card>
        </li>
      ))}
    </ul>
  );
}
