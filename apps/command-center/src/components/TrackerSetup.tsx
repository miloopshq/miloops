import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BRAND,
  CONNECTORS,
  trackerSettingsApi,
  type CredentialSource,
  type RemoteKind,
  type SyncStatus,
  type TrackerSettings,
  type TrackerTestResult,
} from '@miloops-hq/core';
import type { Prefs, TrackerChoice } from '../prefs';

export const trackerApi = trackerSettingsApi(BRAND.apiPrefix);

const SOURCE: Record<CredentialSource, string> = {
  stored: 'Saved token',
  gh: 'gh CLI',
  GITHUB_TOKEN: '$GITHUB_TOKEN',
  GH_TOKEN: '$GH_TOKEN',
  LINEAR_API_KEY: '$LINEAR_API_KEY',
};

export function switchTracker(update: (p: Partial<Prefs>) => void, tracker: TrackerChoice) {
  update({ tracker });
  const url = new URL(location.href);
  url.searchParams.delete('tracker');
  location.href = url.toString();
}

/** Settings from the local server; undefined while loading, null when there is no server (static demo). */
export function useTrackerSettings(pollMs = 0) {
  const [s, setS] = useState<TrackerSettings | null>();
  const load = useCallback(() => trackerApi.get().then(setS, () => setS(null)), []);
  useEffect(() => {
    void load();
    if (!pollMs) return;
    const t = setInterval(() => void load(), pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);
  return [s, setS, load] as const;
}

const ago = (t?: number) => {
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
};

const hhmm = (t?: number) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

export function SyncLine({ status }: { status?: SyncStatus }) {
  if (!status) return null;
  const rate = status.rate?.limit ? `${status.rate.remaining?.toLocaleString() ?? '?'}/${status.rate.limit.toLocaleString()} req` : '';
  const queued = status.queued ? ` · ${status.queued} queued` : '';
  const [cls, text] =
    status.state === 'online'
      ? ['ok', `Online · synced ${ago(status.lastSyncAt)}`]
      : status.state === 'offline'
        ? ['warn', `Offline${queued}`]
        : status.state === 'rate-limited'
          ? ['warn', `Rate limited · resumes ${hhmm(status.resetAt)}${queued}`]
          : status.state === 'auth-error'
            ? ['alert', 'Credentials rejected']
            : ['', 'Connecting'];
  return (
    <div className={`sync-line ${cls}`} title={status.error}>
      <span className="dot" />
      <span>{text}</span>
      {rate && <span className="rate">{rate}</span>}
    </div>
  );
}

function TestLine({ r }: { r?: TrackerTestResult }) {
  if (!r) return null;
  if (!r.ok) return <div className="test-line alert">✕ {r.error}</div>;
  const rate = r.rate?.limit ? `${r.rate.remaining?.toLocaleString()}/${r.rate.limit.toLocaleString()} req` : '';
  return (
    <div className="test-line ok">
      ✓ {[r.account, r.target, r.canWrite === false ? 'read-only' : r.canWrite ? 'read/write' : '', rate].filter(Boolean).join(' · ')}
    </div>
  );
}

function Credential(props: { source: CredentialSource | null; value: string; onChange: (v: string) => void; label: string; placeholder: string; link?: { href: string; text: string } }) {
  const [paste, setPaste] = useState(!props.source);
  if (props.source && !paste)
    return (
      <div className="ts-auth">
        <span className="mono-label">{props.label}</span>
        <span className="tag on">{SOURCE[props.source]}</span>
        <button type="button" className="btn ghost" onClick={() => setPaste(true)}>
          Use another
        </button>
      </div>
    );
  return (
    <label>
      <span className="ts-label">
        {props.label}
        {props.link && (
          <a href={props.link.href} target="_blank" rel="noreferrer">
            {props.link.text}
          </a>
        )}
      </span>
      <input type="password" autoComplete="off" spellCheck={false} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
    </label>
  );
}

function GitHubSetup(props: { s: TrackerSettings; onConnected: () => void }) {
  const gh = props.s.github;
  const [repo, setRepo] = useState(gh.repo ?? gh.detectedRepo ?? '');
  const [token, setToken] = useState('');
  const [result, setResult] = useState<TrackerTestResult>();
  const [busy, setBusy] = useState<'test' | 'connect'>();
  const test = useCallback(async () => {
    setBusy('test');
    setResult(await trackerApi.test({ kind: 'github', repo, token: token || undefined }).catch((e: Error) => ({ ok: false, error: e.message })));
    setBusy(undefined);
  }, [repo, token]);
  useEffect(() => {
    if (gh.auth && repo) void test();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const connect = async () => {
    setBusy('connect');
    try {
      await trackerApi.connect({ active: 'github', github: { repo, token: token || undefined } });
      props.onConnected();
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
      setBusy(undefined);
    }
  };
  return (
    <div className="tracker-setup">
      <label>
        Repository
        <input value={repo} placeholder="owner/name" spellCheck={false} onChange={(e) => setRepo(e.target.value.trim())} />
      </label>
      <Credential source={gh.auth} value={token} onChange={setToken} label="Token" placeholder="ghp_… or github_pat_…" link={{ href: 'https://github.com/settings/personal-access-tokens/new', text: 'New token' }} />
      <TestLine r={result} />
      <footer>
        <button type="button" className="btn" disabled={!!busy || !repo} onClick={() => void test()}>
          {busy === 'test' ? 'Testing…' : 'Test connection'}
        </button>
        <button type="button" className="btn primary" disabled={!!busy || !repo || (!gh.auth && !token)} onClick={() => void connect()}>
          {busy === 'connect' ? 'Connecting…' : 'Connect'}
        </button>
      </footer>
    </div>
  );
}

function LinearSetup(props: { s: TrackerSettings; onConnected: () => void }) {
  const ln = props.s.linear;
  const [apiKey, setApiKey] = useState('');
  const [teamId, setTeamId] = useState(ln.teamId ?? '');
  const [projectId, setProjectId] = useState(ln.projectId ?? '');
  const [result, setResult] = useState<TrackerTestResult>();
  const [teams, setTeams] = useState<NonNullable<TrackerTestResult['teams']>>([]);
  const [busy, setBusy] = useState<'test' | 'connect'>();
  const test = useCallback(
    async (team = teamId) => {
      setBusy('test');
      const r = await trackerApi.test({ kind: 'linear', apiKey: apiKey || undefined, teamId: team || undefined }).catch((e: Error) => ({ ok: false, error: e.message }) as TrackerTestResult);
      setResult(r);
      if (r.teams) {
        setTeams(r.teams);
        if (!team && r.teams.length === 1) setTeamId(r.teams[0].id);
      }
      setBusy(undefined);
    },
    [apiKey, teamId],
  );
  useEffect(() => {
    if (ln.auth) void test();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const team = teams.find((t) => t.id === teamId);
  const project = result?.projects?.find((p) => p.id === projectId);
  const connect = async () => {
    if (!team) return;
    setBusy('connect');
    try {
      await trackerApi.connect({ active: 'linear', linear: { teamId: team.id, teamKey: team.key, teamName: team.name, projectId: project?.id, projectName: project?.name, apiKey: apiKey || undefined } });
      props.onConnected();
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
      setBusy(undefined);
    }
  };
  return (
    <div className="tracker-setup">
      <Credential source={ln.auth} value={apiKey} onChange={setApiKey} label="API key" placeholder="lin_api_…" link={{ href: 'https://linear.app/settings/account/security', text: 'New key' }} />
      {teams.length > 0 && (
        <div className="ts-row">
          <label>
            Team
            <select
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                setProjectId('');
                void test(e.target.value);
              }}
            >
              {!teamId && <option value="">Choose…</option>}
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.key} · {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Project
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!result?.projects}>
              <option value="">All projects</option>
              {result?.projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <TestLine r={result} />
      <footer>
        <button type="button" className="btn" disabled={!!busy || (!ln.auth && !apiKey)} onClick={() => void test()}>
          {busy === 'test' ? 'Testing…' : 'Test connection'}
        </button>
        <button type="button" className="btn primary" disabled={!!busy || !team} onClick={() => void connect()}>
          {busy === 'connect' ? 'Connecting…' : 'Connect'}
        </button>
      </footer>
    </div>
  );
}

const isRemote = (k: string): k is RemoteKind => k === 'github' || k === 'linear';

/** The Tracker section of Settings: one card per connector, with inline setup for GitHub and Linear. */
export function TrackerConnectors(props: { activeTracker: TrackerChoice; location: string; update: (p: Partial<Prefs>) => void }) {
  const [s] = useTrackerSettings(5000);
  const [open, setOpen] = useState<RemoteKind | null>(null);
  const select = async (id: TrackerChoice) => {
    if (s && (id === 'markdown' || isRemote(id))) await trackerApi.connect({ active: id === 'markdown' ? 'markdown' : id, ...(id === 'github' && s.github.repo ? { github: { repo: s.github.repo } } : {}), ...(id === 'linear' && s.linear.teamId ? { linear: { teamId: s.linear.teamId, teamKey: s.linear.teamKey, teamName: s.linear.teamName, projectId: s.linear.projectId, projectName: s.linear.projectName } } : {}) }).catch(() => {});
    switchTracker(props.update, id);
  };
  const configured = useMemo(() => ({ github: !!s?.github.repo, linear: !!s?.linear.teamId }), [s]);
  return (
    <>
      <div className="connectors">
        {CONNECTORS.map((c) => {
          const id = c.id as TrackerChoice;
          const active = id === props.activeTracker;
          const remote = isRemote(id);
          const usable = !remote || !!s;
          return (
            <div key={c.id} className={`connector ${active ? 'active' : ''} ${usable ? '' : 'disabled'} ${open === id ? 'open' : ''}`}>
              <div className="c-top">
                <b>{c.name}</b>
                {active && <span className="tag on">Active</span>}
              </div>
              {(c.id === 'markdown' || remote) && active && <div className="c-loc">{props.location}</div>}
              {remote && !active && configured[id] && <div className="c-loc">{id === 'github' ? s!.github.repo : [s!.linear.teamKey, s!.linear.projectName].filter(Boolean).join(' · ')}</div>}
              {remote && active && <SyncLine status={s?.[id].status} />}
              <div className="c-actions">
                {!active && (!remote || configured[id]) && (
                  <button className="btn" disabled={!usable} onClick={() => void select(id)}>
                    Switch
                  </button>
                )}
                {remote && (
                  <button className={`btn ${open === id ? 'on' : ''}`} disabled={!usable} onClick={() => setOpen(open === id ? null : id)}>
                    {configured[id] ? 'Edit' : 'Connect'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {s && open === 'github' && <GitHubSetup s={s} onConnected={() => switchTracker(props.update, 'github')} />}
      {s && open === 'linear' && <LinearSetup s={s} onConnected={() => switchTracker(props.update, 'linear')} />}
    </>
  );
}
