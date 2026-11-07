import { useState, useRef, useEffect } from 'react';
import { Card } from '../../components/ui';
import { ReconnectPaste } from './ReconnectPaste';
import { slackApi } from './slackApi';
import { SlackAppCard } from './SlackAppCard';
import { SlackPreferences } from './SlackPreferences';
import { SlackSetupPanel } from './SlackSetupPanel';
import { useSlackStatus } from './useSlackStatus';

/** Settings → Slack. Hidden when there is no local server (a static build). */
export function SlackSettings(props: { focus?: boolean }) {
  const [s, setS] = useSlackStatus(3000);
  const [setup, setSetup] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.focus && s) ref.current?.scrollIntoView({ block: 'start' });
  }, [props.focus, !!s]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return null;
  const connected = s.step === 'done';
  const patch = (p: Parameters<typeof slackApi.update>[0]) => slackApi.update(p).then(setS, () => {});
  return (
    <div ref={ref} className="slack-settings">
      <SlackAppCard
        s={s}
        setup={setup}
        onSetup={setSetup}
        onToggle={() => void patch({ enabled: !s.enabled })}
        onRemoved={(x) => {
          setS(x);
          setSetup(false);
        }}
      />

      {!connected && (setup || s.step !== 1) && <SlackSetupPanel s={s} set={setS} />}
      {setup && connected && s.state === 'auth-error' && (
        <Card tone="inset" className="slack-setup">
          <p>
            Generate a new app-level token or reinstall the app, then paste the new token. Settings and the owner are
            kept.
          </p>
          <ReconnectPaste set={setS} />
        </Card>
      )}

      {connected && <SlackPreferences s={s} set={setS} patch={(p) => void patch(p)} />}
    </div>
  );
}
