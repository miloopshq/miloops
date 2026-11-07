import type { TrackerSettings, TrackerTestResult } from '@teamtrail/core';
import { useState, useCallback, useEffect } from 'react';
import { Credential } from './Credential';
import { TestLine } from './TestLine';
import { trackerApi } from './trackerApi';

export function GitHubSetup(props: { s: TrackerSettings; onConnected: () => void }) {
  const gh = props.s.github;
  const [repo, setRepo] = useState(gh.repo ?? gh.detectedRepo ?? '');
  const [token, setToken] = useState('');
  const [result, setResult] = useState<TrackerTestResult>();
  const [busy, setBusy] = useState<'test' | 'connect'>();
  const test = useCallback(async () => {
    setBusy('test');
    setResult(
      await trackerApi
        .test({ kind: 'github', repo, token: token || undefined })
        .catch((e: Error) => ({ ok: false, error: e.message })),
    );
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
    <div className="card inset tracker-setup">
      <label className="field">
        Repository
        <input
          value={repo}
          placeholder="owner/name"
          spellCheck={false}
          onChange={(e) => setRepo(e.target.value.trim())}
        />
      </label>
      <Credential
        source={gh.auth}
        value={token}
        onChange={setToken}
        label="Token"
        placeholder="ghp_… or github_pat_…"
        link={{ href: 'https://github.com/settings/personal-access-tokens/new', text: 'New token' }}
      />
      <TestLine r={result} />
      <footer>
        <button type="button" className="btn" disabled={!!busy || !repo} onClick={() => void test()}>
          {busy === 'test' ? 'Testing…' : 'Test connection'}
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!!busy || !repo || (!gh.auth && !token)}
          onClick={() => void connect()}
        >
          {busy === 'connect' ? 'Connecting…' : 'Connect'}
        </button>
      </footer>
    </div>
  );
}
