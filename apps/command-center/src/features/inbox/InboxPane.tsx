import type { ActivityState, MapSnapshot } from '@miloops-hq/core';
import { type ReactNode, useState, useEffect } from 'react';
import { SectionHeader, MiloMark, Badge, Panel } from '../../components/ui';
import { Conversation } from './Conversation';
import { HitlReadout } from './HitlReadout';
import { InboxList } from './InboxList';

export function InboxPane(props: {
  activity: ActivityState;
  snaps: Record<string, MapSnapshot>;
  currentMapId?: string;
  sessionId?: string;
  layout: 'split' | 'stack';
  convRequest: number;
  onOpen: (sessionId: string, ticketId?: string) => void;
  onAnswer: (questionId: string, text: string) => void;
  /** Rendered under the inbox in the same column (the Up next list). */
  below?: ReactNode;
}) {
  const [view, setView] = useState<'list' | 'conv'>('list');
  useEffect(() => {
    if (props.convRequest) setView('conv');
  }, [props.convRequest]);
  const items = [...props.activity.pending].sort((a, b) => a.at - b.at);
  const open = (sessionId: string, ticketId?: string) => {
    props.onOpen(sessionId, ticketId);
    setView('conv');
  };

  const list = (
    <div className="inbox-part">
      <SectionHeader
        hot={items.length > 0}
        title={
          <>
            {items.length > 0 && <MiloMark variant="alert" size={12} />}
            Waiting on you
          </>
        }
        count={<Badge key={items.length} n={items.length} urgent={items.length > 0} pop />}
      />
      <HitlReadout activity={props.activity} />
      <InboxList
        items={items}
        snaps={props.snaps}
        currentMapId={props.currentMapId}
        selected={props.sessionId}
        onOpen={open}
      />
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
            {list}
            {props.below}
          </div>
        )}
      </Panel>
    );
  const hasConv = !!props.activity.sessions.find((s) => s.id === props.sessionId);
  return (
    <Panel className={`zone inbox split ${hasConv ? 'has-conv' : ''}`} style={{ gridArea: 'inbox' }}>
      {list}
      {hasConv && conv}
      {props.below}
    </Panel>
  );
}
