import type { ApprovalItem, MapSnapshot } from '@miloops-hq/core';
import { MetaLine, Row } from '../../components/ui';
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
  return (
    <ul className="inbox-list approvals">
      {props.items.map((a) => {
        const held = a.kind !== 'approve';
        const otherMission = a.mapId !== props.currentMapId ? props.snaps[a.mapId]?.map.title : undefined;
        return (
          <Row
            key={`${a.mapId}/${a.ticketId}`}
            as="li"
            edge={held ? 'attention' : 'neutral'}
            title={`${held ? 'Decide' : 'Approve'}: ${a.title}`}
            context={<MetaLine parts={[held ? 'Held' : 'Verified', { text: a.ticketKey, code: true }, otherMission]} />}
            detail={a.reason}
            detailText={a.reason}
            trailing={ago(now - a.at)}
            onOpen={() => props.onOpen(a.mapId, a.ticketId)}
          />
        );
      })}
    </ul>
  );
}
