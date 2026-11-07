import { MetaLine } from '../../components/ui';

/** The HITL line's title: the ticket on one line (full text on hover), then the trail and agent. */
export function ConversationTicket(props: { ticket?: { key: string; title: string }; trail?: string; agent: string }) {
  const { ticket } = props;
  return (
    <div className="comms-ticket">
      <div className="t-title t-pixel" title={ticket && `${ticket.key} ${ticket.title}`}>
        <span className="key">{ticket?.key}</span> {ticket?.title}
      </div>
      <MetaLine parts={[props.trail, props.agent]} />
    </div>
  );
}
