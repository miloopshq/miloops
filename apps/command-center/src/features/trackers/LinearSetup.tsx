import type { TrackerSettings, TrackerTestResult } from '@miloops-hq/core';
import { useState, useCallback, useEffect } from 'react';
import { Select } from '../../components/ui';
import { Credential } from './Credential';
import { TestLine } from './TestLine';
import { trackerApi } from './trackerApi';

export function LinearSetup(props: { s: TrackerSettings; onConnected: () => void }) {
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
      const r = await trackerApi
        .test({ kind: 'linear', apiKey: apiKey || undefined, teamId: team || undefined })
        .catch((e: Error) => ({ ok: false, error: e.message }) as TrackerTestResult);
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
      await trackerApi.connect({
        active: 'linear',
        linear: {
          teamId: team.id,
          teamKey: team.key,
          teamName: team.name,
          projectId: project?.id,
          projectName: project?.name,
          apiKey: apiKey || undefined,
        },
      });
      props.onConnected();
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
      setBusy(undefined);
    }
  };
  return (
    <div className="card inset tracker-setup">
      <Credential
        source={ln.auth}
        value={apiKey}
        onChange={setApiKey}
        label="API key"
        placeholder="lin_api_…"
        link={{ href: 'https://linear.app/settings/account/security', text: 'New key' }}
      />
      {teams.length > 0 && (
        <div className="ts-row">
          <label className="field">
            Team
            <Select
              aria-label="Team"
              value={teamId}
              onChange={(id) => {
                setTeamId(id);
                setProjectId('');
                void test(id);
              }}
              options={[
                ...(teamId ? [] : [{ value: '', label: 'Choose…' }]),
                ...teams.map((t) => ({ value: t.id, label: `${t.key} · ${t.name}` })),
              ]}
            />
          </label>
          <label className="field">
            Project
            <Select
              aria-label="Project"
              value={projectId}
              onChange={setProjectId}
              disabled={!result?.projects}
              options={[
                { value: '', label: 'All projects' },
                ...(result?.projects ?? []).map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
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
