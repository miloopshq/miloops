import { BRAND, type MapDoc } from '@miloops-hq/core';
import { useState } from 'react';
import { Meta } from '../../components/ui';
import { OPERATOR } from '../../lib';
import { verificationApi } from '../../lib/verification';
import { LevelControl } from '../verification';
import { SettingsSection } from './SettingsSection';
import { useVerificationConfig } from './useVerificationConfig';

/** Read-only: checks are changed in the repo, so an agent cannot edit what verifies its own work. */
export function VerificationSection(props: { map?: MapDoc }) {
  const view = useVerificationConfig();
  const [error, setError] = useState<string>();
  if (!view) return null;
  const map = props.map;
  const c = view.config;
  const file = `${BRAND.dataDir}/${view.file}`;
  const [cls, text] = view.errors.length
    ? ['alert', `${file} has errors · completions that need checks wait on you`]
    : view.exists
      ? ['ok', `${file} · ${c?.run.length ?? 0} checks on every completion`]
      : ['', `No ${file} · completing a ticket closes it`];
  return (
    <SettingsSection title="Verification">
      <div className={`sync-line ${cls}`} title={view.hash}>
        <span className="dot" />
        <span>{text}</span>
      </div>
      {map && (
        <div className="vf-mission">
          <span className="mono-label">Mission {map.key}</span>
          <LevelControl
            value={map.verification}
            onChange={(level) => {
              setError(undefined);
              verificationApi
                .act({ action: 'level', mapId: map.id, level, by: OPERATOR })
                .catch((e: Error) => setError(e.message));
            }}
          />
          {error && <span className="vf-err">{error}</span>}
        </div>
      )}
      {view.errors.length > 0 && (
        <ul className="vf-errors">
          {view.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {c && view.exists && (
        <>
          <Meta
            parts={[
              `New missions: ${c.default}`,
              `${c.maxAttempts} attempts`,
              c.failFast && 'Stops at the first failure',
            ]}
          />
          <div className="vf-checks">
            {Object.entries(c.checks).map(([name, spec]) => (
              <div key={name} className="vf-check">
                <span className="mono-label">{c.run.includes(name) ? name : `${name} (on request)`}</span>
                <code>{spec.run.join(' ')}</code>
                <span className="dim">
                  {spec.timeoutSec} s{spec.cwd && spec.cwd !== '.' ? ` · in ${spec.cwd}` : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <span className="dim vf-hint">Edit {file} in the repo to change checks. It is never changed from here.</span>
    </SettingsSection>
  );
}
