import type { ActivityState, AttentionView, MapSnapshot } from '@miloops-hq/core';
import { Badge, MiloMark, SectionHeader } from '../../components/ui';
import { AttentionQueue, type AttentionApi, type AttentionHandlers } from '../attention';
import { ApprovalList } from './ApprovalList';
import { HitlReadout } from './HitlReadout';
import { InboxList } from './InboxList';
import { useApprovals } from './useApprovals';

/** The current mission's brief already has its own card above the queue; don't list it twice. */
function withoutShownBrief(view: AttentionView, currentMapId?: string): AttentionView {
  return { ...view, items: view.items.filter((i) => !(i.kind === 'brief' && i.mapId === currentMapId)) };
}

/**
 * "Waiting on you": the ranked attention queue (questions, approvals, blocked work, flags, knowledge, …).
 * Until the queue has loaded, or where the server has none, the plain question and approval lists.
 */
export function WaitingOnYou(props: {
  activity: ActivityState;
  snaps: Record<string, MapSnapshot>;
  currentMapId?: string;
  sessionId?: string;
  attention?: AttentionApi;
  handlers?: AttentionHandlers;
  /** A brief card is shown above for the current mission. */
  briefShown: boolean;
  onOpenQuestion: (sessionId: string, ticketId?: string) => void;
  onOpenTicket: (mapId: string, ticketId: string) => void;
}) {
  const questions = [...props.activity.pending].sort((a, b) => a.at - b.at);
  const approvals = useApprovals(props.snaps);
  const raw = props.attention?.view;
  const view = raw && props.briefShown ? withoutShownBrief(raw, props.currentMapId) : raw;
  const waiting = view ? view.items.length : questions.length + approvals.length;
  const header = (
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
  );
  if (view && props.attention && props.handlers)
    return (
      <div className="inbox-part">
        {header}
        <HitlReadout activity={props.activity} />
        <AttentionQueue
          view={view}
          snaps={props.snaps}
          pending={props.activity.pending}
          currentMapId={props.currentMapId}
          selected={props.sessionId}
          handlers={props.handlers}
          onSnooze={props.attention.snooze}
          onDismiss={props.attention.dismiss}
        />
      </div>
    );
  return (
    <div className="inbox-part">
      {header}
      <HitlReadout activity={props.activity} />
      <ApprovalList
        items={approvals}
        snaps={props.snaps}
        currentMapId={props.currentMapId}
        onOpen={props.onOpenTicket}
      />
      {(questions.length > 0 || !approvals.length) && (
        <InboxList
          items={questions}
          snaps={props.snaps}
          currentMapId={props.currentMapId}
          selected={props.sessionId}
          onOpen={props.onOpenQuestion}
        />
      )}
    </div>
  );
}
