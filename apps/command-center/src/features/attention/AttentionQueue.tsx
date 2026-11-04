import type { AttentionView, MapSnapshot, PendingQuestion } from '@miloops-hq/core';
import { EmptyState } from '../../components/ui';
import { useNow } from '../../hooks';
import { AttentionItemRow } from './AttentionItemRow';
import { batches } from './batches';
import { BatchGroup } from './BatchGroup';
import { openItem, type AttentionHandlers } from './openItem';

/** "Waiting on you", ranked: everything that needs the human, best first, related items batched together. */
export function AttentionQueue(props: {
  view: AttentionView;
  snaps: Record<string, MapSnapshot>;
  pending: PendingQuestion[];
  currentMapId?: string;
  /** The open conversation's session, to mark its question. */
  selected?: string;
  handlers: AttentionHandlers;
  onSnooze: (id: string, minutes: number) => void;
  onDismiss: (id: string) => void;
}) {
  const now = useNow(1000);
  const { view } = props;
  if (!view.items.length)
    return (
      <EmptyState
        title="Nothing waiting on you"
        hint={
          view.hidden
            ? `${view.hidden} snoozed or set aside. They come back when the snooze ends.`
            : 'When an agent needs your call, it lands here, most important first.'
        }
      />
    );
  const many = Object.keys(props.snaps).length > 1;
  const interrupting = new Set(view.interrupting);
  const sessionOf = (questionId: string) => props.pending.find((q) => q.id === questionId)?.sessionId;
  return (
    <div className="attention-queue">
      {batches(view.items).map((b) => (
        <BatchGroup key={b.key} batch={b} mission={many ? props.snaps[b.mapId]?.map.title : undefined}>
          {b.items.map((item) => (
            <AttentionItemRow
              key={item.id}
              item={item}
              snap={props.snaps[item.mapId]}
              many={many}
              current={item.mapId === props.currentMapId}
              selected={item.kind === 'question' && sessionOf(item.ref) === props.selected}
              interrupting={interrupting.has(item.id)}
              now={now}
              onOpen={() => openItem(item, props.handlers)}
              onSnooze={(minutes) => props.onSnooze(item.id, minutes)}
              onDismiss={() => props.onDismiss(item.id)}
            />
          ))}
        </BatchGroup>
      ))}
    </div>
  );
}
