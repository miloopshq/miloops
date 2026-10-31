import type { MapSnapshot, PendingQuestion, SessionInfo } from '@miloops-hq/core';
import { BriefingDialog } from '../features/briefing';
import type { Breakpoint, useBriefing } from '../hooks';

/** "While you were away", wired to the app: every jump dismisses it first. */
export function AppBriefing(props: {
  brief: ReturnType<typeof useBriefing>;
  snaps: Record<string, MapSnapshot>;
  bp: Breakpoint;
  openTicket: (mapId: string, ticketId: string) => void;
  openChat: (sessionId: string, ticketId?: string, mapId?: string) => void;
  openDecisions: (focus?: string) => void;
  closeDecisions: () => void;
  showPhoneHome: () => void;
}) {
  const { brief, bp } = props;
  return (
    <BriefingDialog
      briefing={brief.briefing}
      line={brief.line}
      snaps={props.snaps}
      bp={bp}
      onClose={brief.dismiss}
      onTicket={(mapId, ticketId) => {
        brief.dismiss();
        props.openTicket(mapId, ticketId);
      }}
      onAnswer={(q: PendingQuestion) => {
        brief.dismiss();
        props.closeDecisions();
        props.openChat(q.sessionId, q.ticketId, q.mapId);
      }}
      onSession={(s: SessionInfo) => {
        brief.dismiss();
        props.closeDecisions();
        props.openChat(s.id, s.ticketId, s.mapId);
      }}
      onDecision={(id) => {
        brief.dismiss();
        props.openDecisions(id);
      }}
      onResume={() => {
        brief.dismiss();
        props.closeDecisions();
        if (bp === 'mobile') props.showPhoneHome();
      }}
    />
  );
}
