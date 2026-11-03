import type { ActivityState, MapSnapshot } from '@miloops-hq/core';
import { type ReactNode, useState, useEffect } from 'react';
import { SectionHeader, MiloMark, Badge, Panel } from '../../components/ui';
import { ApprovalList } from './ApprovalList';
import { Conversation } from './Conversation';
import { HitlReadout } from './HitlReadout';
import { InboxList } from './InboxList';
import { useApprovals } from './useApprovals';

export function InboxPane(props: {
  activity: ActivityState;
  snaps: Record<string, MapSnapshot>;
  currentMapId?: string;
  sessionId?: string;
  layout: 'split' | 'stack';
  convRequest: number;
  onOpen: (sessionId: string, ticketId?: string) => void;
  onAnswer: (questionId: string, text: string) => void;
  /** Opens a ticket waiting on approval in the inspector. */
  onOpenTicket: (mapId: string, ticketId: string) => void;
  /** Rendered under the inbox in the same column (the Up next list). */
  below?: ReactNode;
  /** Shown above the inbox list (a discovery brief waiting for review). */
  above?: ReactNode;
}) {
  const [view, setView] = useState<'list' | 'conv'>('list');
  useEffect(() => {
    if (props.convRequest) setView('conv');
  }, [props.convRequest]);
  const items = [...props.activity.pending].sort((a, b) => a.at - b.at);
  const approvals = useApprovals(props.snaps);
  const waiting = items.length + approvals.length;
  const open = (sessionId: string, ticketId?: string) => {
    props.onOpen(sessionId, ticketId);
    setView('conv');
  };

  const list = (
    <div className="inbox-part">
      <SectionHeader
        hot={waiting > 0}
        title={
          <>
            {waiting > 0 && <MiloMark variant="alert" size={12} />}
            Waiting on you
          </>
        }
        count={<Badge key={waiting} n={waiting} urgent={waiting > 0} pop />}
      />
      <HitlReadout activity={props.activity} />
      <ApprovalList
        items={approvals}
        snaps={props.snaps}
        currentMapId={props.currentMapId}
        onOpen={props.onOpenTicket}
      />
      {(items.length > 0 || !approvals.length) && (
        <InboxList
          items={items}
          snaps={props.snaps}
          currentMapId={props.currentMapId}
          selected={props.sessionId}
          onOpen={open}
        />
      )}
    </div>
  );
  const conv = (
    <Conversation
      activity={props.activity}
      snaps={props.snaps}
      sessionId={props.sessionId}
      onAnswer={props.onAnswer}
      onBack={props.layout === 'stack' ? () => setView('list') : undefined}
    />
  );

  if (props.layout === 'stack')
    return (
      <Panel className="zone inbox stack">
        {view === 'conv' && props.sessionId ? (
          conv
        ) : (
          <div className="stack-scroll">
            {props.above}
            {list}
            {props.below}
          </div>
        )}
      </Panel>
    );
  const hasConv = !!props.activity.sessions.find((s) => s.id === props.sessionId);
  return (
    <Panel className={`zone inbox split ${hasConv ? 'has-conv' : ''}`} style={{ gridArea: 'inbox' }}>
      <SectionHeader
        className="zone-title"
        title="Communication"
        info="Where your agents reach you: questions waiting on you, the conversation with the agent that asked, and the tickets coming up next."
      />
      {props.above}
      {list}
      {hasConv && conv}
      {props.below}
    </Panel>
  );
}
