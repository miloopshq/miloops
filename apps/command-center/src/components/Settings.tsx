import { useEffect, useState, type ReactNode } from 'react';
import { AGENT_INTEGRATIONS, BRAND, HITL_LABEL, MAP_LABEL, PLAN_ONLY_LABEL, type HitlTranscriptMode, type MapDoc, type MapMode } from '@miloops-hq/core';
import { ModeChoice } from './CommandBar';
import { Tabs } from './Hud';
import { NEXT, RELEASES } from '../changelog';
import type { Prefs, TrackerChoice } from '../prefs';
import { MiloMark } from './MiloMark';
import { TrackerConnectors, switchTracker, trackerApi, useTrackerSettings } from './TrackerSetup';

function TranscriptChoice(props: { value: HitlTranscriptMode; onChange: (v: HitlTranscriptMode) => void }) {
  const opts: { v: HitlTranscriptMode; title: string }[] = [
    { v: 'summary', title: 'Summary' },
    { v: 'full', title: 'Full transcript' },
  ];
  return (
    <div className="choice-row">
      {opts.map((o) => (
        <button key={o.v} type="button" className={`choice ${props.value === o.v ? 'on' : ''}`} onClick={() => props.onChange(o.v)}>
          <b>{o.title}</b>
        </button>
      ))}
    </div>
  );
}

const AWAY_MINUTES = [5, 15, 30, 60];

function BriefingChoice(props: { value: Prefs['briefing']; onChange: (v: Prefs['briefing']) => void }) {
  const { value } = props;
  return (
    <div className="choice-row compact">
      <button type="button" className={`choice ${value.enabled ? '' : 'on'}`} onClick={() => props.onChange({ ...value, enabled: false })}>
        <b>Off</b>
      </button>
      {AWAY_MINUTES.map((m) => (
        <button key={m} type="button" className={`choice ${value.enabled && value.awayMinutes === m ? 'on' : ''}`} onClick={() => props.onChange({ enabled: true, awayMinutes: m })}>
          <b>Away {m} min</b>
        </button>
      ))}
    </div>
  );
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="set-sec">
      <h4>{props.title}</h4>
      {props.children}
    </section>
  );
}

export function SettingsPanel(props: {
  prefs: Prefs;
  update: (p: Partial<Prefs>) => void;
  activeTracker: TrackerChoice;
  location: string;
  map?: MapDoc;
  onMapMode: (m: MapMode) => void;
  onClose: () => void;
  initialTab?: 'settings' | 'changelog';
}) {
  const { prefs, update } = props;
  const [tab, setTab] = useState(props.initialTab ?? 'settings');
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [props]);
  return (
    <div className="scrim" onClick={props.onClose}>
      <div className="dialog settings" onClick={(e) => e.stopPropagation()}>
        <header>
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'settings', label: 'Settings' },
              { id: 'changelog', label: 'Changelog' },
            ]}
          />
          <button className="x" onClick={props.onClose} aria-label="Close">
            ×
          </button>
        </header>

        {tab === 'changelog' ? (
          <Changelog />
        ) : (
          <>
            {props.map && (
              <Section title={`Mission ${props.map.key}`}>
                <ModeChoice value={props.map.mode} onChange={props.onMapMode} />
              </Section>
            )}

            <Section title="Tracker">
              <TrackerConnectors activeTracker={props.activeTracker} location={props.location} update={update} />
            </Section>

            <Section title="Labels">
              <div className="label-codes">
                <code>{MAP_LABEL}</code>
                <code>{BRAND.labelPrefix}:&lt;type&gt;</code>
                <code>{HITL_LABEL}</code>
                <code>{PLAN_ONLY_LABEL}</code>
              </div>
            </Section>

            <Section title="HITL transcript">
              <TranscriptChoice value={prefs.hitlTranscript} onChange={(hitlTranscript) => update({ hitlTranscript })} />
            </Section>

            <Section title="Briefing">
              <BriefingChoice value={prefs.briefing} onChange={(briefing) => update({ briefing })} />
            </Section>

            <Section title="Agent">
              <div className="choice-row">
                {AGENT_INTEGRATIONS.map((a) => (
                  <button key={a.id} type="button" className={`choice ${a.status === 'primary' ? 'on' : ''}`} disabled={a.status !== 'primary'}>
                    <b>{a.name}</b>
                  </button>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Changelog() {
  return (
    <div className="changelog">
      <div className="about">
        <span className="about-name">{BRAND.name}</span>
        <span className="mono-label">{BRAND.category}</span>
        <p className="onb-tagline">{BRAND.tagline}</p>
        <p className="dim">
          {BRAND.assistant.name} · {BRAND.assistant.expansion}
        </p>
      </div>
      <Section title="Next">
        {NEXT.map((n) => (
          <div key={n.area} className="cl-row">
            <span className="cl-k">{n.area}</span>
            <ul>
              {n.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </Section>
      {RELEASES.map((r) => (
        <Section key={r.version} title={`${r.version} · ${r.date}`}>
          <ul>
            {r.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}

export function Onboarding(props: { prefs: Prefs; update: (p: Partial<Prefs>) => void; activeTracker: TrackerChoice }) {
  const { prefs, update } = props;
  const [trackers] = useTrackerSettings();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  /** One-click GitHub when a token (gh / env) and a GitHub `origin` are already on this machine. */
  const ghRepo = trackers?.github.auth ? trackers.github.repo ?? trackers.github.detectedRepo : undefined;
  const choices: { id: TrackerChoice; title: string; sub?: string }[] = [
    { id: 'markdown', title: 'Local markdown' },
    ...(ghRepo ? [{ id: 'github' as const, title: 'GitHub Issues', sub: ghRepo }] : []),
    { id: 'demo', title: 'Demo' },
  ];
  const start = async () => {
    if (prefs.tracker === 'github' && ghRepo) {
      setBusy(true);
      try {
        await trackerApi.connect({ active: 'github', github: { repo: ghRepo } });
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
        return;
      }
    } else if (prefs.tracker === 'markdown' && trackers) await trackerApi.connect({ active: 'markdown' }).catch(() => {});
    update({ onboarded: true });
    if (prefs.tracker !== props.activeTracker) switchTracker(update, prefs.tracker);
  };
  return (
    <div className="scrim">
      <div className="dialog onboarding">
        <div className="onb-brand">
          <MiloMark size={40} />
          <div className="onb-title">{BRAND.name}</div>
        </div>
        <div className="onb-cat mono-label">{BRAND.category}</div>
        <p className="onb-tagline">{BRAND.tagline}</p>
        <p className="milo-line">
          <span className="chip-label">
            <MiloMark variant="voice" size={11} /> {BRAND.assistant.name}
          </span>{' '}
          Pick a tracker and how I record HITL conversations.
        </p>

        <Section title="Tracker">
          <div className="choice-row">
            {choices.map((c) => (
              <button key={c.id} type="button" className={`choice ${prefs.tracker === c.id ? 'on' : ''}`} onClick={() => update({ tracker: c.id })}>
                <b>{c.title}</b>
                {c.sub && <span className="c-sub">{c.sub}</span>}
              </button>
            ))}
          </div>
          {error && <div className="test-line alert">✕ {error}</div>}
        </Section>

        <Section title="HITL transcript">
          <TranscriptChoice value={prefs.hitlTranscript} onChange={(hitlTranscript) => update({ hitlTranscript })} />
        </Section>

        <footer>
          <button className="btn primary" disabled={busy} onClick={() => void start()}>
            Get started
          </button>
        </footer>
      </div>
    </div>
  );
}
