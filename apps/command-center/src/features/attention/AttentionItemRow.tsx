import { isDismissable, type AttentionItem, type MapSnapshot } from '@miloops-hq/core';
import { Card, Meta } from '../../components/ui';
import { ago } from '../../lib';
import { KIND_LABEL } from './attentionLabels';
import { IntegrationAction } from './IntegrationAction';
import { ReasonChips } from './ReasonChips';
import { SnoozeMenu } from './SnoozeMenu';

/** How long a new item carries the dot-matrix "Incoming" signal. */
const INCOMING_MS = 15_000;

/** One thing that needs the human: what, why it ranks here, how long it has waited, and "later". */
export function AttentionItemRow(props: {
  item: AttentionItem;
  snap?: MapSnapshot;
  /** Show the mission name (more than one mission). */
  many: boolean;
  current: boolean;
  selected: boolean;
  interrupting: boolean;
  now: number;
  onOpen: () => void;
  onSnooze: (minutes: number) => void;
  onDismiss: () => void;
}) {
  const { item, snap } = props;
  const ticket = snap?.tickets.find((t) => t.id === item.ticketId);
  const who = item.kind === 'question' ? item.agent : KIND_LABEL[item.kind];
  const hot = props.interrupting || item.urgency === 'blocking';
  const ticketLine = ticket && !item.title.includes(ticket.title) ? ticket.title : undefined;
  return (
    <li className={`att-item k-${item.kind} u-${item.urgency} ${props.selected ? 'sel' : ''}`}>
      <Card as="button" tone={hot ? 'urgent' : undefined} on={props.selected} onClick={props.onOpen}>
        <span className="row1">
          <span className={`who ${item.kind}`}>{who}</span>
          <span className="key">{ticket?.key}</span>
          {item.urgency === 'blocking' && <span className="urgency-tag">Blocking</span>}
          {props.now - item.since < INCOMING_MS && <span className="signal-tag">Incoming</span>}
          <span className="age">{ago(props.now - item.since)}</span>
        </span>
        {props.many && (
          <Meta className={`mission-tag ${props.current ? 'cur' : ''}`} parts={[snap?.map.title ?? item.mapId]} />
        )}
        {ticketLine && <span className="ttl">{ticketLine}</span>}
        <span className="q t-title">{item.title.split('\n')[0]}</span>
        <ReasonChips reasons={item.reasons} />
      </Card>
      {item.kind === 'integration' && <IntegrationAction item={item} />}
      <SnoozeMenu
        title={item.title}
        canDismiss={isDismissable(item)}
        onSnooze={props.onSnooze}
        onDismiss={props.onDismiss}
      />
    </li>
  );
}
