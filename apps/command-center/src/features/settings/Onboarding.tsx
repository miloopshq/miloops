import { BRAND } from '@miloops-hq/core';
import { useState } from 'react';
import { Panel, MiloMark, Wordmark, Label, Choice, Button } from '../../components/ui';
import type { Prefs, TrackerChoice } from '../../lib';
import { useTrackerSettings, trackerApi, switchTracker } from '../trackers';
import { SettingsSection } from './SettingsSection';
import { TranscriptChoice } from './TranscriptChoice';

export function Onboarding(props: { prefs: Prefs; update: (p: Partial<Prefs>) => void; activeTracker: TrackerChoice }) {
  const { prefs, update } = props;
  const [trackers] = useTrackerSettings();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  /** One-click GitHub when a token (gh / env) and a GitHub `origin` are already on this machine. */
  const ghRepo = trackers?.github.auth ? (trackers.github.repo ?? trackers.github.detectedRepo) : undefined;
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
    } else if (prefs.tracker === 'markdown' && trackers)
      await trackerApi.connect({ active: 'markdown' }).catch(() => {});
    update({ onboarded: true });
    if (prefs.tracker !== props.activeTracker) switchTracker(update, prefs.tracker);
  };
  return (
    <div className="scrim">
      <Panel as="div" className="dialog onboarding">
        <div className="onb-brand">
          <MiloMark size={40} />
          <Wordmark as="div" className="onb-title" />
        </div>
        <div className="onb-cat mono-label">{BRAND.category}</div>
        <p className="onb-tagline">{BRAND.tagline}</p>
        <p className="milo-line">
          <Label>
            <MiloMark variant="voice" size={11} /> {BRAND.assistant.name}
          </Label>{' '}
          Pick a tracker and how I record HITL conversations.
        </p>

        <SettingsSection title="Tracker">
          <div className="choice-row">
            {choices.map((c) => (
              <Choice
                key={c.id}
                on={prefs.tracker === c.id}
                title={c.title}
                sub={c.sub}
                onClick={() => update({ tracker: c.id })}
              />
            ))}
          </div>
          {error && <div className="test-line alert">✕ {error}</div>}
        </SettingsSection>

        <SettingsSection title="HITL transcript">
          <TranscriptChoice value={prefs.hitlTranscript} onChange={(hitlTranscript) => update({ hitlTranscript })} />
        </SettingsSection>

        <footer>
          <Button variant="primary" disabled={busy} onClick={() => void start()}>
            Get started
          </Button>
        </footer>
      </Panel>
    </div>
  );
}
