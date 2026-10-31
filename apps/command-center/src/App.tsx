import { useMemo, useState } from 'react';
import {
  AppBriefing,
  AppHeader,
  AppSettings,
  LaptopSide,
  MapZone,
  PhoneTabBar,
  PhoneView,
  type SettingsOpen,
  settingsFromUrl,
  useAppNavigation,
  useDocumentTitle,
  useRepoName,
  useScopedActivity,
} from './app/index';
import { StepZone, LogZone, ActivityStack } from './features/activity';
import { DecisionsView } from './features/decisions';
import { InboxPane } from './features/inbox';
import { Inspector } from './features/inspector';
import { NewMissionDialog } from './features/mission';
import { MapSections } from './features/plan';
import { Onboarding } from './features/settings';
import { UpNext } from './features/up-next';
import { useBriefing, useBreakpoint, usePrefs, useCommandCenter } from './hooks';
import { createRuntime, trackerKind } from './lib';

/**
 * Progressive disclosure. Layers by priority:
 *   1 inbox + answer · 2 title + destination · 3 up next (frontier/claimed) · 4 map graph
 *   5 ticket inspector · 6 activity + sessions · 7 plan sections (not yet specified, decisions, out of scope)
 * mobile (<1024): 1–3 on the home view; 4–7 behind a fixed bottom tab bar.
 * laptop (1024–1439): adds 4 in the center and 5 on the right; 6–7 are tabs in that same right zone.
 * wide (≥1440): 6 and 7 get their own zones under the map and the ticket. Nothing visible moves.
 */
export function App() {
  const rt = useMemo(() => createRuntime(trackerKind()), []);
  const api = useCommandCenter(rt);
  const { snap, activity, selection, actions } = api;
  const [prefs, updatePrefs] = usePrefs();
  const [settingsOpen, setSettingsOpen] = useState<SettingsOpen>(settingsFromUrl);
  const [newMission, setNewMission] = useState(false);
  const repo = useRepoName(rt.kind);
  const bp = useBreakpoint();
  const brief = useBriefing(rt, api, prefs.briefing);
  const pending = activity.pending.length;
  const scoped = useScopedActivity(activity, api.mapId);
  useDocumentTitle(pending, snap?.map.title);
  const nav = useAppNavigation(api, bp);

  const inbox = (
    <InboxPane
      activity={activity}
      snaps={api.allSnaps}
      currentMapId={api.mapId}
      sessionId={api.chatSession}
      layout={bp === 'mobile' ? 'stack' : 'split'}
      convRequest={nav.convRequest}
      onOpen={nav.openChat}
      onAnswer={actions.answer}
      onOpenTicket={nav.openTicket}
      below={
        <UpNext
          snap={snap}
          sessions={scoped.sessions}
          selection={selection}
          onSelect={nav.select}
          onWork={() => actions.work()}
        />
      }
    />
  );
  const map = (
    <MapZone
      api={api}
      sessions={scoped.sessions}
      onSelect={nav.select}
      onNewMission={() => setNewMission(true)}
      compact={bp === 'mobile'}
      minFit={bp === 'mobile' ? 0.7 : 0}
    />
  );
  const inspector = (bare: boolean) => (
    <Inspector
      api={api}
      sessions={scoped.sessions}
      bare={bare}
      onOpenChat={(id) => nav.openChat(id)}
      onOpenDecision={nav.openDecisions}
    />
  );
  const zoneProps = {
    activity: scoped,
    snap,
    leases: api.leases,
    onTicket: (id: string) => nav.select({ kind: 'ticket', id }),
    onOpenChat: (id: string) => nav.openChat(id),
  };
  const plan = (bare: boolean) => (
    <MapSections
      snap={snap}
      selection={selection}
      onSelect={nav.select}
      bare={bare}
      onAudit={() => nav.openDecisions()}
    />
  );
  const decisions = nav.decisionsView && (
    <DecisionsView
      api={api}
      bp={bp}
      focus={nav.decisionsView.focus}
      onClose={() => nav.setDecisionsView(null)}
      onOpenTicket={nav.openTicket}
    />
  );
  const briefing = brief.shown && (
    <AppBriefing
      brief={brief}
      snaps={api.allSnaps}
      bp={bp}
      openTicket={nav.openTicket}
      openChat={nav.openChat}
      openDecisions={nav.openDecisions}
      closeDecisions={() => nav.setDecisionsView(null)}
      showPhoneHome={() => nav.setPhoneTab('home')}
    />
  );

  return (
    <div className={`app bp-${bp}`}>
      <AppHeader
        api={api}
        rt={rt}
        repo={repo}
        brief={brief}
        decisionsOpen={!!nav.decisionsView}
        onDecisions={() => (nav.decisionsView ? nav.setDecisionsView(null) : nav.openDecisions())}
        onNewMission={() => setNewMission(true)}
        onSettings={setSettingsOpen}
      />
      {bp === 'wide' && (
        <>
          {inbox}
          {map}
          {inspector(false)}
          <StepZone {...zoneProps} />
          <LogZone {...zoneProps} />
          {plan(false)}
          {decisions}
        </>
      )}
      {bp === 'laptop' && (
        <>
          {inbox}
          {map}
          <LaptopSide
            tab={nav.sideTab}
            onTab={nav.setSideTab}
            unspecified={snap?.map.sections.unspecified.length}
            ticket={inspector(true)}
            activity={<ActivityStack {...zoneProps} />}
            plan={plan(true)}
          />
          {decisions}
        </>
      )}
      {bp === 'mobile' && (
        <>
          <PhoneView
            tab={nav.phoneTab}
            decisions={decisions}
            inbox={inbox}
            map={map}
            ticket={inspector(true)}
            activity={<ActivityStack {...zoneProps} />}
            plan={plan(true)}
          />
          <PhoneTabBar
            tab={nav.phoneTab}
            covered={!!nav.decisionsView}
            pending={pending}
            onPick={(id) => {
              nav.setPhoneTab(id);
              nav.setDecisionsView(null);
            }}
          />
        </>
      )}

      {briefing}
      {api.error && <div className="error-toast">{api.error}</div>}
      {settingsOpen && (
        <AppSettings
          rt={rt}
          api={api}
          prefs={prefs}
          update={updatePrefs}
          focus={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {newMission && (
        <NewMissionDialog onClose={() => setNewMission(false)} onSubmit={actions.chart} tracker={rt.adapter.label} />
      )}
      {!prefs.onboarded && <Onboarding prefs={prefs} update={updatePrefs} activeTracker={rt.kind} />}
    </div>
  );
}
