import { useEffect, useRef, useState } from 'react';
import { BRAND, eventPulse, missionProgress, type ActivityState, type MapDoc, type MapSnapshot, type TrackerHealth } from '@miloops-hq/core';
import { Bars, dur, hms, useNow } from './Hud';
import { MiloMark, type MarkState } from './MiloMark';

export function Header(props: {
  repo: string;
  snaps: Record<string, MapSnapshot>;
  map?: MapDoc;
  activity: ActivityState;
  health: TrackerHealth;
  trackerLabel: string;
  onSelectMap: (id: string) => void;
  onNewMission: () => void;
  onToggleMode: () => void;
  onSettings: () => void;
  decisions: number;
  decisionsOpen: boolean;
  onDecisions: () => void;
  briefingOpen: boolean;
  onBriefing: () => void;
}) {
  const { map } = props;
  const now = useNow(1000);
  const waiting = props.activity.pending.length;
  const cur = map && props.snaps[map.id];
  const p = cur && missionProgress(cur);
  return (
    <header className="header">
      <div className="h-brand">
        <MiloMark size={28} className="logo" title={BRAND.name} />
        <span className="wordmark">{BRAND.name}</span>
      </div>
      <div className="h-title">
        <div className="h-line1">
          <span className="repo">{props.repo}</span>
          <span className="sep">/</span>
          <MissionSwitcher {...props} />
        </div>
        <div className="h-dest" title={map?.sections.destination}>
          <span className="chip-label">Destination</span>
          {map?.sections.destination ?? '—'}
        </div>
      </div>
      <div className="h-right">
        {map && p && (
          <span className="mission-meta">
            <span className="readout" title="Mission elapsed time, since it was charted">
              <span className="mono-label">Mission T+</span>
              <b>{hms(now - map.createdAt)}</b>
            </span>
            <span className="readout">
              <span className="mono-label">Decided</span>
              <b>
                {p.decided}/{p.total}
              </b>
            </span>
          </span>
        )}
        {map && (
          <button className="mode-chip" onClick={props.onToggleMode} title="Mission mode">
            {map.mode === 'plan-only' ? 'Plan only' : 'Plan + execute'}
          </button>
        )}
        {waiting > 0 && (
          <span className="waiting-chip" title={`${waiting} waiting on you`}>
            <MiloMark variant="alert" size={14} />
            <b>{waiting}</b>
            <span className="wl">&nbsp;waiting on you</span>
          </span>
        )}
        <TrackerChip label={props.trackerLabel} health={props.health} now={now} />
        <TrackerPulse health={props.health} now={now} />
        <button className={`btn ghost briefing-btn ${props.briefingOpen ? 'on' : ''}`} onClick={props.onBriefing} aria-pressed={props.briefingOpen} title="While you were away">
          <MiloMark size={14} />
          <span className="bl">Briefing</span>
        </button>
        <button className={`btn ghost decisions-btn ${props.decisionsOpen ? 'on' : ''}`} onClick={props.onDecisions} aria-pressed={props.decisionsOpen}>
          Decisions <span className="n">{props.decisions}</span>
        </button>
        <button className="btn ghost" onClick={props.onSettings}>
          Settings
        </button>
      </div>
    </header>
  );
}

const SYNC_TEXT: Record<TrackerHealth['status'], string> = { idle: 'Idle', syncing: 'Syncing', ok: 'Synced', error: 'Sync error' };

/** `metrics.trackerHealth`: sync status and last-write latency. */
function TrackerChip({ label, health, now }: { label: string; health: TrackerHealth; now: number }) {
  const title = [
    `${SYNC_TEXT[health.status]} · ${health.writes} writes · ${health.errors} errors`,
    health.lastWriteAt ? `Last write ${dur(health.lastWriteMs ?? 0)}, ${dur(now - health.lastWriteAt)} ago` : 'No writes yet',
    health.lastError,
  ].filter(Boolean).join('\n');
  return (
    <span className={`tracker-chip sync-${health.status}`} title={title}>
      <span className="chip-label">Tracker</span>
      <MiloMark variant="status" state={health.status as MarkState} size={13} className="sync-glyph" />
      <span className="tl">{label}</span>
      <span className="latency">{health.lastWriteMs !== undefined ? dur(health.lastWriteMs) : '—'}</span>
    </span>
  );
}

/** `metrics.eventPulse`: tracker events over the last minute; watcher/external changes highlighted. */
function TrackerPulse({ health, now }: { health: TrackerHealth; now: number }) {
  const p = eventPulse(health, now);
  return (
    <span className="pulse" title={`${p.total} tracker events in the last minute (${p.external.reduce((a, b) => a + b, 0)} external)`}>
      <Bars values={p.all} hot={p.external} height={18} />
      <span className="mono-label">{p.total}/min</span>
    </span>
  );
}

function MissionSwitcher(props: { snaps: Record<string, MapSnapshot>; map?: MapDoc; activity: ActivityState; onSelectMap: (id: string) => void; onNewMission: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  const missions = Object.values(props.snaps).sort((a, b) => b.map.createdAt - a.map.createdAt);
  const waitingIn = (id: string) => props.activity.pending.filter((q) => q.mapId === id).length;
  const otherWaiting = props.activity.pending.filter((q) => q.mapId !== props.map?.id).length;
  return (
    <div className="mission-switcher" ref={ref}>
      <button className="mission-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="mission-title">{props.map ? `${props.map.key} ${props.map.title}` : 'No mission'}</span>
        {otherWaiting > 0 && <span className="badge urgent">{otherWaiting}</span>}
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="mission-menu" role="menu">
          <div className="menu-h">Missions</div>
          {missions.map((s) => {
            const p = missionProgress(s);
            const w = waitingIn(s.map.id);
            return (
              <button
                key={s.map.id}
                role="menuitem"
                className={`mission-item ${s.map.id === props.map?.id ? 'on' : ''}`}
                onClick={() => {
                  props.onSelectMap(s.map.id);
                  setOpen(false);
                }}
              >
                <span className="key">{s.map.key}</span>
                <span className="mi-title">{s.map.title}</span>
                <span className="mi-progress">
                  {p.decided}/{p.total}
                </span>
                <span className={`badge ${w ? 'urgent' : 'zero'}`}>{w || ''}</span>
              </button>
            );
          })}
          <button
            role="menuitem"
            className="mission-item new"
            onClick={() => {
              setOpen(false);
              props.onNewMission();
            }}
          >
            + New mission
          </button>
        </div>
      )}
    </div>
  );
}
