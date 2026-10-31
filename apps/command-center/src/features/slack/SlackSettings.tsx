import { SLACK_NOTIFY_EVENTS } from '@miloops-hq/connector-slack';
import { useState, useRef, useEffect } from 'react';
import { Card, Pill, Button, Label, Choice, Field, Meta } from '../../components/ui';
import { ChannelTarget } from './ChannelTarget';
import { ReconnectPaste } from './ReconnectPaste';
import { slackApi } from './slackApi';
import { SlackSetupPanel } from './SlackSetupPanel';
import { SlackStateLine, EVENT_LABEL } from './SlackStateLine';
import { UserPicker } from './UserPicker';
import { useSlackStatus } from './useSlackStatus';

/** Settings → Slack. Hidden when there is no local server (the static demo). */
export function SlackSettings(props: { focus?: boolean }) {
  const [s, setS] = useSlackStatus(3000);
  const [setup, setSetup] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [channel, setChannel] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.focus && s) ref.current?.scrollIntoView({ block: 'start' });
  }, [props.focus, !!s]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return null;
  const connected = s.step === 'done';
  const patch = (p: Parameters<typeof slackApi.update>[0]) => slackApi.update(p).then(setS, () => {});
  const events = new Set(s.notify.events);
  const toChannel = channel || s.notify.target !== 'dm';
  return (
    <div ref={ref} className="slack-settings">
      <Card className={`connector ${connected && s.enabled ? 'active' : ''} ${setup || !connected ? 'open' : ''}`}>
        <div className="card-row">
          <b className="card-title">MILO app</b>
          {connected && <Pill className={s.enabled ? 'on' : ''}>{s.enabled ? 'On' : 'Off'}</Pill>}
        </div>
        {connected && (
          <div className="c-loc">
            {[s.workspace?.name, s.workspace?.url?.replace(/^https?:\/\/|\/$/g, ''), s.setup.appId]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}
        {connected && <SlackStateLine s={s} />}
        {!connected && s.step === 1 && !setup && (
          <p className="sl-lead">
            Answer agents and save threads as decisions from Slack. Your own Slack app, connected from this machine;
            tokens stay in your local credential store.
          </p>
        )}
        <div className="c-actions">
          {!connected && !setup && (
            <Button size="sm" variant="primary" onClick={() => setSetup(true)}>
              {s.step === 1 ? 'Connect' : `Resume at step ${s.step}`}
            </Button>
          )}
          {connected && (
            <Button size="sm" on={s.enabled} onClick={() => void patch({ enabled: !s.enabled })}>
              {s.enabled ? 'Turn off' : 'Turn on'}
            </Button>
          )}
          {connected && s.state === 'auth-error' && (
            <Button size="sm" variant="primary" onClick={() => setSetup(true)}>
              Reconnect
            </Button>
          )}
          {s.step !== 1 &&
            (confirm ? (
              <>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    void slackApi.remove().then(
                      (x) => (setS(x), setConfirm(false), setSetup(false)),
                      () => {},
                    )
                  }
                >
                  Remove tokens and settings
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
                Remove
              </Button>
            ))}
        </div>
      </Card>

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

      {connected && (
        <div className="sl-groups">
          <div className="sl-group">
            <Label variant="plain" size="sm">
              Owner
            </Label>
            <div className="sl-owner">
              <b>@{s.owners[0]?.name ?? s.owners[0]?.id}</b>
              {s.owners[0]?.via === 'git-email' && <span className="mono-label dim">Matched your git email</span>}
              <button type="button" className="link" onClick={() => void slackApi.resetOwner().then(setS, () => {})}>
                Not you? Reset
              </button>
            </div>
          </div>
          <div className="sl-group">
            <Label variant="plain" size="sm">
              Allowed users
            </Label>
            <UserPicker value={s.allow} owners={s.owners} onChange={(allow) => void patch({ allow })} />
          </div>
          <div className="sl-group">
            <Label variant="plain" size="sm">
              Notify
            </Label>
            <div className="choice-row compact">
              <Choice
                on={!toChannel}
                title="DM to owner"
                onClick={() => {
                  setChannel(false);
                  void patch({ notify: { target: 'dm', detail: 'full' } });
                }}
              />
              <Choice
                on={toChannel}
                title="Channel"
                sub={s.notify.target !== 'dm' ? s.notify.target : undefined}
                onClick={() => setChannel(true)}
              />
            </div>
            {toChannel && (
              <>
                <Field label="Channel ID (invite @MILO there first)">
                  <ChannelTarget value={s.notify.target} onSave={(target) => void patch({ notify: { target } })} />
                </Field>
                <div className="choice-row compact">
                  <Choice
                    on={s.notify.detail === 'full'}
                    title="Full questions"
                    onClick={() => void patch({ notify: { detail: 'full' } })}
                  />
                  <Choice
                    on={s.notify.detail === 'titles-only'}
                    title="Titles only"
                    onClick={() => void patch({ notify: { detail: 'titles-only' } })}
                  />
                </div>
              </>
            )}
            <div className="choice-row compact">
              {SLACK_NOTIFY_EVENTS.map((e) => (
                <Choice
                  key={e}
                  on={events.has(e)}
                  title={EVENT_LABEL[e]}
                  onClick={() =>
                    void patch({
                      notify: {
                        events: events.has(e) ? s.notify.events.filter((x) => x !== e) : [...s.notify.events, e],
                      },
                    })
                  }
                />
              ))}
            </div>
          </div>
          <Meta
            className="dim"
            parts={[
              `${s.command} decide`,
              `${s.command} status`,
              `${s.command} inbox`,
              'Save as decision on any message',
            ]}
          />
        </div>
      )}
    </div>
  );
}
