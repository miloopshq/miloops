import { type SlackStatus, type SlackTokenResult, appIdFromToken, slackLinks } from '@miloops-hq/connector-slack';
import { BRAND } from '@miloops-hq/core';
import { useState, type ReactNode } from 'react';
import { Meta, Card } from '../../components/ui';
import { ExtLink } from './ExtLink';
import { PasteToken } from './PasteToken';
import { slackApi } from './slackApi';
import { SlackStateLine } from './SlackStateLine';
import { StepFact } from './StepFact';
import { STEPS, isDone, isCurrent } from './steps';
import { useTokenPickup, PASTE_KEY } from './useTokenPickup';

/**
 * The five-step guided setup. Each step turns green once the local server verifies it; the
 * state lives in the user's config folder, so closing the browser resumes at the same step.
 */
export function SlackSetupPanel(props: { s: SlackStatus; set: (s: SlackStatus) => void }) {
  const { s, set } = props;
  const [result, setResult] = useState<SlackTokenResult>();
  const [busy, setBusy] = useState(false);
  const [installOpened, setInstallOpened] = useState(false);
  const onToken = (token: string, gesture: boolean) => {
    const appId = appIdFromToken(token);
    // The install page is the next stop anyway; open it while the paste still counts as a click.
    if (gesture && appId && !s.setup.botToken && window.open(slackLinks.install(appId), '_blank'))
      setInstallOpened(true);
    setBusy(true);
    void slackApi
      .token(token)
      .catch((e: Error) => ({ ok: false, error: e.message, status: s }) as SlackTokenResult)
      .then((r) => {
        setBusy(false);
        setResult(r);
        set(r.status);
      });
  };
  const auto = useTokenPickup(onToken);
  const pickup = auto ? 'come back to this tab' : `press ${PASTE_KEY} here`;
  const step = s.step;
  const line = (n: number) =>
    result &&
    (n === 4
      ? result.kind === 'bot' || (!result.ok && step === 4)
      : result.kind === 'app' || (!result.ok && step !== 4)) ? (
      <div className={`test-line ${result.ok ? 'ok' : 'alert'}`}>
        {result.ok
          ? result.kind === 'app'
            ? `✓ Socket Mode reachable · app ${result.status.setup.appId}`
            : `✓ Installed in ${result.status.workspace?.name} as @${result.status.bot?.name ?? 'milo'}`
          : `✕ ${result.error}`}
      </div>
    ) : null;
  const body: Record<number, ReactNode> = {
    1: (
      <>
        <p>
          Slack opens with the MILO app filled in from a manifest: the {s.command} command, Save as decision, and Socket
          Mode. Nothing is hosted by {BRAND.name}.
        </p>
        <div className="sl-actions">
          <ExtLink primary href={s.links.create} onClick={() => void slackApi.created().then(set, () => {})}>
            Create Slack app
          </ExtLink>
        </div>
      </>
    ),
    2: (
      <p>
        In Slack: pick the workspace → <b>Next</b> → <b>Create</b>.
      </p>
    ),
    3: (
      <>
        <p>
          On the page Slack just opened: <b>App-Level Tokens</b> → <b>Generate Token and Scopes</b> → name it{' '}
          <code>miloops</code> → add <code>connections:write</code> → <b>Generate</b> → <b>Copy</b>, then {pickup}.
        </p>
        <div className="sl-actions">
          <PasteToken busy={busy} placeholder="xapp-…" onToken={onToken} />
        </div>
        {line(3)}
        <Meta
          className="dim"
          parts={[
            'Waiting for the app-level token',
            s.links.create && (
              <a key="again" href={s.links.create} target="_blank" rel="noreferrer">
                Open the manifest again
              </a>
            ),
          ]}
        />
      </>
    ),
    4: (
      <>
        <p>
          {installOpened ? (
            "Slack's install page is open in a new tab: "
          ) : (
            <>
              <b>Install to workspace</b> →{' '}
            </>
          )}
          <b>Allow</b> → copy the <b>Bot User OAuth Token</b> (starts with <code>xoxb-</code>), then {pickup}.
        </p>
        <div className="sl-actions">
          <ExtLink primary={!installOpened} href={s.links.install}>
            {installOpened ? 'Open install page again' : 'Install to workspace'}
          </ExtLink>
          <PasteToken busy={busy} placeholder="xoxb-…" onToken={onToken} />
        </div>
        {line(4)}
      </>
    ),
    5: (
      <>
        <p>
          Your git email doesn't match a member of {s.workspace?.name ?? 'the workspace'}, so tell MILO who you are:
          open its Home tab in Slack and click <b>This is me</b>. MILO sends you a DM, and questions from agents arrive
          there.
        </p>
        <div className="sl-actions">
          <ExtLink primary href={s.links.home}>
            Open MILO in Slack
          </ExtLink>
          {s.links.homeWeb && <ExtLink href={s.links.homeWeb}>Open in browser</ExtLink>}
        </div>
        <SlackStateLine s={s} />
      </>
    ),
  };
  return (
    <Card tone="inset" className="slack-setup">
      <ol className="pipeline sl-pipeline" aria-label="Slack setup">
        {STEPS.map((x) => (
          <li key={x.n} className={isDone(step, x.n) ? 'done' : isCurrent(step, x.n) ? 'cur' : ''}>
            <i />
            <span>
              {x.n} {x.title}
            </span>
          </li>
        ))}
      </ol>
      <ol className="sl-steps">
        {STEPS.map((x) => {
          const done = isDone(step, x.n);
          const cur = isCurrent(step, x.n);
          return (
            <li key={x.n} className={done ? 'done' : cur ? 'cur' : ''}>
              <div className="sl-step-h">
                <span className="sl-n">{done ? '✓' : x.n}</span>
                <b>{x.title}</b>
                {done && <StepFact s={s} n={x.n} />}
              </div>
              {cur && <div className="sl-step-b">{body[x.n]}</div>}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
