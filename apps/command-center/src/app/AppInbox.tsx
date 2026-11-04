import type { ReactNode } from 'react';
import { InboxPane } from '../features/inbox';
import { UpNext } from '../features/up-next';
import type { CommandCenterApi, useBreakpoint } from '../hooks';
import type { useAppNavigation } from './useAppNavigation';
import type { useAttentionUi } from './useAttentionUi';
import type { useScopedActivity } from './useScopedActivity';

/** The Communication zone: the ranked queue, the conversation and Up next, wired to the app. */
export function AppInbox(props: {
  api: CommandCenterApi;
  nav: ReturnType<typeof useAppNavigation>;
  bp: ReturnType<typeof useBreakpoint>;
  scoped: ReturnType<typeof useScopedActivity>;
  attn: ReturnType<typeof useAttentionUi>;
  /** A discovery brief waiting for review, shown above the queue. */
  above?: ReactNode;
}) {
  const { api, nav } = props;
  return (
    <InboxPane
      activity={api.activity}
      snaps={api.allSnaps}
      currentMapId={api.mapId}
      sessionId={api.chatSession}
      layout={props.bp === 'mobile' ? 'stack' : 'split'}
      convRequest={nav.convRequest}
      onOpen={nav.openChat}
      onAnswer={api.actions.answer}
      onOpenTicket={nav.openTicket}
      attention={props.attn.attention}
      handlers={props.attn.handlers}
      below={
        <UpNext snap={api.snap} sessions={props.scoped.sessions} selection={api.selection} onSelect={nav.select} />
      }
      above={props.above}
    />
  );
}
