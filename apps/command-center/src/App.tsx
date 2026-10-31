import { useEffect, useMemo, useState } from 'react';
import { BRAND } from '@miloops-hq/core';
import { createRuntime, trackerKind } from './runtime';
import { useCommandCenter, type CommandCenterApi, type Selection } from './useCommandCenter';
import { usePrefs } from './prefs';
import { Header } from './components/Header';
import { InboxPane } from './components/Inbox';
import { MapGraph } from './components/MapGraph';
import { Inspector } from './components/Inspector';
import { ActivityStack, LogZone, MapSections, StatusPanel, StepZone, UpNext } from './components/Zones';
import { CommandBar, NewMissionDialog } from './components/CommandBar';
import { Onboarding, SettingsPanel } from './components/Settings';
import { Tabs, useBreakpoint } from './components/Hud';
import { DecisionsView } from './components/Decisions';
import { BriefingDialog } from './components/Briefing';
import { useBriefing } from './useBriefing';
import { Badge, Button, Panel } from './components/ui';

/** Repo name shown in the header: the folder that contains the tracker data. */
function useRepoName(kind: string) {
  const [name, setName] = useState(kind === 'demo' ? 'demo' : '…');
  useEffect(() => {
    if (kind === 'demo') return;
    fetch(`${BRAND.apiPrefix}/list`)
      .then((r) => r.json())
      .then((j: { root: string }) => {
        const parts = j.root.split('/').filter(Boolean);
        setName(parts[parts.length - 1]?.startsWith('.') ? parts[parts.length - 2] ?? 'repo' : parts[parts.length - 1] ?? 'repo');
      })
      .catch(() => setName('repo'));
  }, [kind]);
  return name;
}

type SideTab = 'ticket' | 'activity' | 'plan';
type PhoneTab = 'home' | 'map' | SideTab;

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
  const { snap, activity, selection, setSelection, actions } = api;
  const [prefs, updatePrefs] = usePrefs();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newMission, setNewMission] = useState(false);
  const repo = useRepoName(rt.kind);
  const bp = useBreakpoint();
  const [sideTab, setSideTab] = useState<SideTab>('ticket');
  const [phoneTab, setPhoneTab] = useState<PhoneTab>('home');
  const [convRequest, setConvRequest] = useState(0);
  /** Decisions view: closed, or open with an optional record to focus. */
  const [decisionsView, setDecisionsView] = useState<{ focus?: string } | null>(null);
  const openDecisions = (focus?: string) => setDecisionsView({ focus });
  const brief = useBriefing(rt, api, prefs.briefing);
  const pending = activity.pending.length;
  /** Map-scoped zones only see this mission's sessions; the inbox sees every mission. */
  const scoped = useMemo(() => {
    const sessions = activity.sessions.filter((s) => s.mapId === api.mapId);
    const other = new Set(activity.sessions.filter((s) => s.mapId !== api.mapId).map((s) => s.id));
    return { ...activity, sessions, feed: activity.feed.filter((e) => !e.sessionId || !other.has(e.sessionId)) };
  }, [activity, api.mapId]);

  useEffect(() => {
    document.title = `${pending ? `(${pending}) ` : ''}${snap?.map.title ?? 'No mission'} · ${BRAND.name}`;
  }, [pending, snap?.map.title]);

  useEffect(() => {
    const s = activity.sessions.find((x) => x.id === api.chatSession);
    if (!selection && s?.ticketId && s.mapId === api.mapId) setSelection({ kind: 'ticket', id: s.ticketId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.chatSession, api.mapId]);

  /** Selecting from the map or a list shows the ticket wherever the ticket layer lives. */
  const select = (s: Selection) => {
    setSelection(s);
    if (!s) return;
    if (bp === 'laptop') setSideTab('ticket');
    if (bp === 'mobile') setPhoneTab('ticket');
  };
  const openChat = (sessionId: string, ticketId?: string, mapId?: string) => {
    if (mapId && mapId !== api.mapId) actions.selectMap(mapId);
    actions.openChat(sessionId);
    const s = activity.sessions.find((x) => x.id === sessionId);
    if (ticketId && s?.mapId === (mapId ?? api.mapId)) setSelection({ kind: 'ticket', id: ticketId });
    if (bp === 'mobile') {
      setPhoneTab('home');
      setConvRequest((n) => n + 1);
    }
  };

  const inbox = (
    <InboxPane
      activity={activity}
      snaps={api.allSnaps}
      currentMapId={api.mapId}
      sessionId={api.chatSession}
      layout={bp === 'mobile' ? 'stack' : 'split'}
      convRequest={convRequest}
      onOpen={openChat}
      onAnswer={actions.answer}
      below={<UpNext snap={snap} sessions={scoped.sessions} selection={selection} onSelect={select} onWork={() => actions.work()} />}
    />
  );
  const map = <MapZone api={api} sessions={scoped.sessions} onSelect={select} onNewMission={() => setNewMission(true)} compact={bp === 'mobile'} minFit={bp === 'mobile' ? 0.7 : 0} />;
  const inspector = (bare: boolean) => <Inspector api={api} sessions={scoped.sessions} bare={bare} onOpenChat={(id) => openChat(id)} onOpenDecision={openDecisions} />;
  const zoneProps = { activity: scoped, snap, onTicket: (id: string) => select({ kind: 'ticket', id }), onOpenChat: (id: string) => openChat(id) };
  const plan = (bare: boolean) => <MapSections snap={snap} selection={selection} onSelect={select} bare={bare} onAudit={() => openDecisions()} />;
  const openTicket = (mapId: string, ticketId: string) => {
    if (mapId !== api.mapId) actions.selectMap(mapId);
    setSelection({ kind: 'ticket', id: ticketId });
    setDecisionsView(null);
    if (bp === 'laptop') setSideTab('ticket');
    if (bp === 'mobile') setPhoneTab('ticket');
  };
  const decisions = decisionsView && <DecisionsView api={api} bp={bp} focus={decisionsView.focus} onClose={() => setDecisionsView(null)} onOpenTicket={openTicket} />;
  const briefing = brief.shown && (
    <BriefingDialog
      briefing={brief.briefing}
      line={brief.line}
      snaps={api.allSnaps}
      bp={bp}
      onClose={brief.dismiss}
      onTicket={(mapId, ticketId) => {
        brief.dismiss();
        openTicket(mapId, ticketId);
      }}
      onAnswer={(q) => {
        brief.dismiss();
        setDecisionsView(null);
        openChat(q.sessionId, q.ticketId, q.mapId);
      }}
      onSession={(s) => {
        brief.dismiss();
        setDecisionsView(null);
        openChat(s.id, s.ticketId, s.mapId);
      }}
      onDecision={(id) => {
        brief.dismiss();
        openDecisions(id);
      }}
      onResume={() => {
        brief.dismiss();
        setDecisionsView(null);
        if (bp === 'mobile') setPhoneTab('home');
      }}
    />
  );
  const header = (
    <Header
      repo={repo}
      snaps={api.allSnaps}
      map={snap?.map}
      activity={activity}
      health={api.health}
      onNewMission={() => setNewMission(true)}
      trackerLabel={rt.adapter.label.toLowerCase()}
      onSelectMap={actions.selectMap}
      onToggleMode={() => snap && actions.setMode(snap.map.mode === 'plan-only' ? 'plan+execute' : 'plan-only')}
      onSettings={() => setSettingsOpen(true)}
      decisions={api.decisions.length}
      decisionsOpen={!!decisionsView}
      onDecisions={() => (decisionsView ? setDecisionsView(null) : openDecisions())}
      briefingOpen={brief.shown}
      onBriefing={() => (brief.shown ? brief.dismiss() : brief.open())}
    />
  );

  return (
    <div className={`app bp-${bp}`}>
      {header}
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
          <Panel className="zone side" style={{ gridArea: 'inspector' }}>
            <Tabs
              className="zone-tabs"
              value={sideTab}
              onChange={setSideTab}
              items={[
                { id: 'ticket', label: 'Ticket' },
                { id: 'activity', label: 'Activity' },
                { id: 'plan', label: 'Plan', n: snap?.map.sections.unspecified.length },
              ]}
            />
            {sideTab === 'ticket' ? inspector(true) : sideTab === 'activity' ? <ActivityStack {...zoneProps} /> : plan(true)}
          </Panel>
          {decisions}
        </>
      )}
      {bp === 'mobile' && (
        <>
          <main className="phone-view">
            {decisions ? decisions : phoneTab === 'home' ? inbox : phoneTab === 'map' ? map : phoneTab === 'ticket' ? <Panel className="zone">{inspector(true)}</Panel> : phoneTab === 'activity' ? <Panel className="zone"><ActivityStack {...zoneProps} /></Panel> : plan(true)}
          </main>
          <nav className="tabbar">
            {(
              [
                ['home', 'Inbox'],
                ['map', 'Map'],
                ['ticket', 'Ticket'],
                ['activity', 'Activity'],
                ['plan', 'Plan'],
              ] as [PhoneTab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                className={phoneTab === id && !decisionsView ? 'on' : ''}
                onClick={() => {
                  setPhoneTab(id);
                  setDecisionsView(null);
                }}
              >
                {label}
                {id === 'home' && pending > 0 && (
                  <Badge key={pending} n={pending} urgent pop />
                )}
              </button>
            ))}
          </nav>
        </>
      )}

      {briefing}
      {api.error && <div className="error-toast">{api.error}</div>}
      {settingsOpen && (
        <SettingsPanel
          prefs={prefs}
          update={updatePrefs}
          activeTracker={rt.kind}
          location={rt.adapter.location}
          map={snap?.map}
          onMapMode={actions.setMode}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {newMission && <NewMissionDialog onClose={() => setNewMission(false)} onSubmit={actions.chart} tracker={rt.adapter.label} />}
      {!prefs.onboarded && <Onboarding prefs={prefs} update={updatePrefs} activeTracker={rt.kind} />}
    </div>
  );
}

function MapZone(props: { api: CommandCenterApi; sessions: CommandCenterApi['activity']['sessions']; onSelect: (s: Selection) => void; onNewMission: () => void; compact: boolean; minFit: number }) {
  const { snap, selection, actions } = props.api;
  return (
    <Panel as="main" className="zone map-zone" style={{ gridArea: 'map' }}>
      {snap && <CommandBar api={props.api} />}
      <div className="map-area">
        {snap && !props.compact && <StatusPanel snap={snap} sessions={props.sessions} />}
        {snap ? (
          <MapGraph snap={snap} sessions={props.sessions} selection={selection} onSelect={props.onSelect} minFit={props.minFit} />
        ) : (
          <div className="nomap">
            <h2>No mission</h2>
            <div className="actions">
              <Button variant="primary" onClick={props.onNewMission}>
                New mission
              </Button>
              <Button onClick={actions.loadSample}>Load sample mission</Button>
            </div>
          </div>
        )}
        {snap && props.compact && <Legend planOnly={snap.map.mode === 'plan-only'} />}
      </div>
    </Panel>
  );
}

function Legend({ planOnly }: { planOnly: boolean }) {
  const items: [string, string][] = [
    ['frontier', 'Frontier'],
    ['claimed', 'Claimed'],
    ['blocked', 'Blocked'],
    ['decided', 'Decided'],
    ...(planOnly ? ([['parked', 'Parked']] as [string, string][]) : []),
    ['out-of-scope', 'Out of scope'],
    ['waiting', 'Waiting on you'],
  ];
  return (
    <div className="legend">
      {items.map(([k, v]) => (
        <span key={k} className={`lg st-${k}`}>
          <i />
          {v}
        </span>
      ))}
      <span className="lg hitl">● needs human</span>
    </div>
  );
}
