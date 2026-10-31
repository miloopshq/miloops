import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BRAND } from '@miloops-hq/core';
import { SLACK_NOTIFY_EVENTS, appIdFromToken, slackLinks, slackSettingsApi, type SlackNotifyEvent, type SlackStatus, type SlackTokenResult, type SlackUser } from '@miloops-hq/connector-slack';
import { Button, Card, Choice, Field, Label, Meta, Pill } from './ui';

export const slackApi = slackSettingsApi(BRAND.apiPrefix);

/** Slack status from the local server; undefined while loading, null when there is no server (static demo). */
export function useSlackStatus(pollMs = 0) {
  const [s, setS] = useState<SlackStatus | null>();
  const load = useCallback(() => slackApi.get().then(setS, () => setS(null)), []);
  useEffect(() => {
    void load();
    if (!pollMs) return;
    const t = setInterval(() => void load(), pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);
  return [s, setS] as const;
}

const EVENT_LABEL: Record<SlackNotifyEvent, string> = {
  awaiting: 'Awaiting you',
  blocked: 'Blocked',
  'mission.done': 'Mission done',
  resolved: 'Resolved',
};

export function SlackStateLine({ s }: { s: SlackStatus }) {
  const [cls, text] =
    s.state === 'online'
      ? ['ok', 'Online']
      : s.state === 'connecting'
        ? ['', 'Connecting']
        : s.state === 'offline'
          ? ['warn', 'Offline · reconnecting']
          : s.state === 'auth-error'
            ? ['alert', 'Disconnected · Slack rejected the tokens']
            : s.state === 'elsewhere'
              ? ['warn', `Connected from another ${BRAND.slug}${s.heldBy ? ` (${s.heldBy})` : ''}`]
              : s.state === 'unsupported'
                ? ['alert', s.error ?? 'Not supported here']
                : ['', s.step === 'done' ? 'Off' : 'Not connected'];
  return (
    <div className={`sync-line ${cls}`} title={s.error}>
      <span className="dot" />
      <span>{text}</span>
    </div>
  );
}

const STEPS: { n: 1 | 2 | 3 | 4 | 5; title: string }[] = [
  { n: 1, title: 'Create app' },
  { n: 2, title: 'Workspace' },
  { n: 3, title: 'App token' },
  { n: 4, title: 'Install' },
  { n: 5, title: 'Claim' },
];

/** Steps 2 and 3 are one stretch in Slack: nothing is verifiable until the app-level token is pasted. */
const isCurrent = (step: SlackStatus['step'], n: number) => step === n || (step === 2 && n === 3);
const isDone = (step: SlackStatus['step'], n: number) => step === 'done' || (typeof step === 'number' && n < step && !isCurrent(step, n));

const TOKEN_RE = /^(xapp-|xoxb-|xoxp-|xoxe)/;
const PASTE_KEY = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform) ? '⌘V' : 'Ctrl+V';

/**
 * Picks up a copied token without a Paste click: the paste shortcut anywhere on the page, or — once
 * the browser has granted clipboard access (Chrome remembers it after the first Paste) — just
 * coming back to this tab. Only token-shaped clipboard text is ever acted on.
 */
function useTokenPickup(onToken: (token: string, gesture: boolean) => void) {
  const cb = useRef(onToken);
  cb.current = onToken;
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    let last = '';
    const take = (text: string, gesture: boolean) => {
      const t = text.trim();
      if (!TOKEN_RE.test(t) || (!gesture && t === last)) return false;
      last = t;
      cb.current(t, gesture);
      return true;
    };
    const onPaste = (e: ClipboardEvent) => {
      if (take(e.clipboardData?.getData('text') ?? '', true)) e.preventDefault();
    };
    const onFocus = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const p = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
        setAuto(p.state === 'granted');
        if (p.state === 'granted') take(await navigator.clipboard.readText(), false);
      } catch {
        // Clipboard reads without a click are Chromium-only; elsewhere the paste shortcut covers it.
      }
    };
    void onFocus();
    document.addEventListener('paste', onPaste);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      document.removeEventListener('paste', onPaste);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);
  return auto;
}

/** Fallback for the paste shortcut: reads the clipboard on click, or takes the token in a field. */
function PasteToken(props: { busy: boolean; placeholder: string; onToken: (token: string, gesture: boolean) => void }) {
  const [manual, setManual] = useState(false);
  const [value, setValue] = useState('');
  const paste = async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setManual(true);
      return;
    }
    if (!text.trim()) setManual(true);
    else props.onToken(text, true);
  };
  return (
    <div className="sl-paste">
      <Button variant="primary" disabled={props.busy} onClick={() => void paste()}>
        {props.busy ? 'Checking…' : 'Paste'}
      </Button>
      {manual ? (
        <form
          className="sl-paste-field"
          onSubmit={(e) => {
            e.preventDefault();
            props.onToken(value, true);
            setValue('');
          }}
        >
          <input type="password" autoComplete="off" spellCheck={false} autoFocus value={value} placeholder={props.placeholder} aria-label="Token" onChange={(e) => setValue(e.target.value)} />
          <Button type="submit" disabled={props.busy || !value.trim()}>
            Save
          </Button>
        </form>
      ) : (
        <button type="button" className="link" onClick={() => setManual(true)}>
          Type it instead
        </button>
      )}
    </div>
  );
}

function ExtLink(props: { href?: string; children: ReactNode; primary?: boolean; onClick?: () => void }) {
  return (
    <a className={`btn ${props.primary ? 'primary' : ''}`} href={props.href} target="_blank" rel="noreferrer" onClick={props.onClick}>
      {props.children}
    </a>
  );
}

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
    if (gesture && appId && !s.setup.botToken && window.open(slackLinks.install(appId), '_blank')) setInstallOpened(true);
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
    result && (n === 4 ? result.kind === 'bot' || (!result.ok && step === 4) : result.kind === 'app' || (!result.ok && step !== 4)) ? (
      <div className={`test-line ${result.ok ? 'ok' : 'alert'}`}>{result.ok ? (result.kind === 'app' ? `✓ Socket Mode reachable · app ${result.status.setup.appId}` : `✓ Installed in ${result.status.workspace?.name} as @${result.status.bot?.name ?? 'milo'}`) : `✕ ${result.error}`}</div>
    ) : null;
  const body: Record<number, ReactNode> = {
    1: (
      <>
        <p>Slack opens with the MILO app filled in from a manifest: the {s.command} command, Save as decision, and Socket Mode. Nothing is hosted by {BRAND.name}.</p>
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
          On the page Slack just opened: <b>App-Level Tokens</b> → <b>Generate Token and Scopes</b> → name it <code>miloops</code> → add <code>connections:write</code> → <b>Generate</b> → <b>Copy</b>, then {pickup}.
        </p>
        <div className="sl-actions">
          <PasteToken busy={busy} placeholder="xapp-…" onToken={onToken} />
        </div>
        {line(3)}
        <Meta className="dim" parts={['Waiting for the app-level token', s.links.create && <a key="again" href={s.links.create} target="_blank" rel="noreferrer">Open the manifest again</a>]} />
      </>
    ),
    4: (
      <>
        <p>
          {installOpened ? "Slack's install page is open in a new tab: " : <><b>Install to workspace</b> → </>}
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
          Your git email doesn't match a member of {s.workspace?.name ?? 'the workspace'}, so tell MILO who you are: open its Home tab in Slack and click <b>This is me</b>. MILO sends you a DM, and questions from agents arrive there.
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

function ReconnectPaste(props: { set: (s: SlackStatus) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const onToken = (token: string) => {
    setBusy(true);
    void slackApi.token(token).then(
      (r) => {
        setBusy(false);
        setError(r.ok ? undefined : r.error);
        props.set(r.status);
      },
      (e: Error) => {
        setBusy(false);
        setError(e.message);
      },
    );
  };
  return (
    <>
      <PasteToken busy={busy} placeholder="xapp-… or xoxb-…" onToken={onToken} />
      {error && <div className="test-line alert">✕ {error}</div>}
    </>
  );
}

function StepFact({ s, n }: { s: SlackStatus; n: number }) {
  const fact = n === 3 ? s.setup.appId && `app ${s.setup.appId}` : n === 4 ? s.workspace && `${s.workspace.name} · @${s.bot?.name ?? 'milo'}` : n === 5 ? s.owners[0] && `owner ${s.owners[0].name ?? s.owners[0].id}${s.owners[0].via === 'git-email' ? ' · git email' : ''}` : undefined;
  return fact ? <span className="mono-label dim">{fact}</span> : null;
}

function UserPicker(props: { value: SlackUser[]; owners: SlackUser[]; onChange: (v: SlackUser[]) => void }) {
  const [members, setMembers] = useState<SlackUser[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    slackApi.members().then(setMembers, (e: Error) => setError(e.message));
  }, []);
  const owner = new Set(props.owners.map((o) => o.id));
  const on = new Set(props.value.map((u) => u.id));
  if (error) return <div className="test-line alert">✕ {error}</div>;
  if (!members) return <span className="mono-label dim">Loading members…</span>;
  return (
    <div className="choice-row compact sl-members">
      {members.map((m) => (
        <Choice
          key={m.id}
          on={owner.has(m.id) || on.has(m.id)}
          disabled={owner.has(m.id)}
          title={`@${m.name ?? m.id}`}
          sub={owner.has(m.id) ? 'Owner' : undefined}
          onClick={() => props.onChange(on.has(m.id) ? props.value.filter((u) => u.id !== m.id) : [...props.value, m])}
        />
      ))}
    </div>
  );
}

function ChannelTarget(props: { value: string; onSave: (id: string) => void }) {
  const [v, setV] = useState(props.value === 'dm' ? '' : props.value);
  const valid = /^[CG][A-Z0-9]{6,}$/.test(v.trim());
  return (
    <form
      className="sl-paste-field"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) props.onSave(v.trim());
      }}
    >
      <input value={v} spellCheck={false} placeholder="Channel ID, e.g. C0123ABCD" aria-label="Channel ID" onChange={(e) => setV(e.target.value)} />
      <Button type="submit" disabled={!valid || v.trim() === props.value}>
        Save
      </Button>
    </form>
  );
}

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
        {connected && <div className="c-loc">{[s.workspace?.name, s.workspace?.url?.replace(/^https?:\/\/|\/$/g, ''), s.setup.appId].filter(Boolean).join(' · ')}</div>}
        {connected && <SlackStateLine s={s} />}
        {!connected && s.step === 1 && !setup && <p className="sl-lead">Answer agents and save threads as decisions from Slack. Your own Slack app, connected from this machine; tokens stay in your local credential store.</p>}
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
                <Button size="sm" variant="danger" onClick={() => void slackApi.remove().then((x) => (setS(x), setConfirm(false), setSetup(false)), () => {})}>
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
          <p>Generate a new app-level token or reinstall the app, then paste the new token. Settings and the owner are kept.</p>
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
              <Choice on={toChannel} title="Channel" sub={s.notify.target !== 'dm' ? s.notify.target : undefined} onClick={() => setChannel(true)} />
            </div>
            {toChannel && (
              <>
                <Field label="Channel ID (invite @MILO there first)">
                  <ChannelTarget value={s.notify.target} onSave={(target) => void patch({ notify: { target } })} />
                </Field>
                <div className="choice-row compact">
                  <Choice on={s.notify.detail === 'full'} title="Full questions" onClick={() => void patch({ notify: { detail: 'full' } })} />
                  <Choice on={s.notify.detail === 'titles-only'} title="Titles only" onClick={() => void patch({ notify: { detail: 'titles-only' } })} />
                </div>
              </>
            )}
            <div className="choice-row compact">
              {SLACK_NOTIFY_EVENTS.map((e) => (
                <Choice key={e} on={events.has(e)} title={EVENT_LABEL[e]} onClick={() => void patch({ notify: { events: events.has(e) ? s.notify.events.filter((x) => x !== e) : [...s.notify.events, e] } })} />
              ))}
            </div>
          </div>
          <Meta className="dim" parts={[`${s.command} decide`, `${s.command} status`, `${s.command} inbox`, 'Save as decision on any message']} />
        </div>
      )}
    </div>
  );
}
