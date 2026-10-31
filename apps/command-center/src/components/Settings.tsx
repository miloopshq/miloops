import { useEffect, useState, type ReactNode } from 'react';
import { AGENT_INTEGRATIONS, BRAND, HITL_LABEL, MAP_LABEL, PLAN_ONLY_LABEL, type HitlTranscriptMode, type MapDoc, type MapMode } from '@miloops-hq/core';
import { ModeChoice } from './CommandBar';
import { Tabs } from './Hud';
import { NEXT, RELEASES } from '../changelog';
import type { Prefs, TrackerChoice } from '../prefs';
import { MiloMark } from './MiloMark';
import { Button, Choice, Label, Meta, Panel } from './ui';
import { TrackerConnectors, switchTracker, trackerApi, useTrackerSettings } from './TrackerSetup';

function TranscriptChoice(props: { value: HitlTranscriptMode; onChange: (v: HitlTranscriptMode) => void }) {
  const opts: { v: HitlTranscriptMode; title: string }[] = [
    { v: 'summary', title: 'Summary' },
    { v: 'full', title: 'Full transcript' },
  ];
  return (
    <div className="choice-row">
      {opts.map((o) => (
        <Choice key={o.v} on={props.value === o.v} title={o.title} onClick={() => props.onChange(o.v)} />
      ))}
    </div>
  );
}

const AWAY_MINUTES = [5, 15, 30, 60];

function BriefingChoice(props: { value: Prefs['briefing']; onChange: (v: Prefs['briefing']) => void }) {
  const { value } = props;
  return (
    <div className="choice-row compact">
      <Choice on={!value.enabled} title="Off" onClick={() => props.onChange({ ...value, enabled: false })} />
      {AWAY_MINUTES.map((m) => (
        <Choice key={m} on={value.enabled && value.awayMinutes === m} title={`Away ${m} min`} onClick={() => props.onChange({ enabled: true, awayMinutes: m })} />
      ))}
    </div>
  );
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="set-sec">
      <Label as="h4">{props.title}</Label>
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
      <Panel as="div" className="dialog settings" onClick={(e) => e.stopPropagation()}>
        <header>
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'settings', label: 'Settings' },
              { id: 'changelog', label: 'Changelog' },
            ]}
          />
          <button className="icon-btn" onClick={props.onClose} aria-label="Close">
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
                  <Choice key={a.id} on={a.status === 'primary'} disabled={a.status !== 'primary'} title={a.name} />
                ))}
              </div>
            </Section>
          </>
        )}
      </Panel>
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
        <Meta as="p" parts={[BRAND.assistant.name, BRAND.assistant.expansion]} />
      </div>
      <Section title="Next">
        {NEXT.map((n) => (
          <div key={n.area} className="cl-row">
            <span className="mono-label">{n.area}</span>
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
      <Panel as="div" className="dialog onboarding">
        <div className="onb-brand">
          <MiloMark size={40} />
          <div className="onb-title">{BRAND.name}</div>
        </div>
        <div className="onb-cat mono-label">{BRAND.category}</div>
        <p className="onb-tagline">{BRAND.tagline}</p>
        <p className="milo-line">
          <Label>
            <MiloMark variant="voice" size={11} /> {BRAND.assistant.name}
          </Label>{' '}
          Pick a tracker and how I record HITL conversations.
        </p>

        <Section title="Tracker">
          <div className="choice-row">
            {choices.map((c) => (
              <Choice key={c.id} on={prefs.tracker === c.id} title={c.title} sub={c.sub} onClick={() => update({ tracker: c.id })} />
            ))}
          </div>
          {error && <div className="test-line alert">✕ {error}</div>}
        </Section>

        <Section title="HITL transcript">
          <TranscriptChoice value={prefs.hitlTranscript} onChange={(hitlTranscript) => update({ hitlTranscript })} />
        </Section>

        <footer>
          <Button variant="primary" disabled={busy} onClick={() => void start()}>
            Get started
          </Button>
        </footer>
      </Panel>
    </div>
  );
}
