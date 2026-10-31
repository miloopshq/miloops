import { BRAND, type MapDoc } from '@miloops-hq/core';
import { Meta } from '../../components/ui';
import { SettingsSection } from './SettingsSection';
import { useVerificationConfig } from './useVerificationConfig';

/** Read-only: checks are changed in the repo, so an agent cannot edit what verifies its own work. */
export function VerificationSection(props: { map?: MapDoc }) {
  const view = useVerificationConfig();
  if (!view) return null;
  const c = view.config;
  const file = `${BRAND.dataDir}/${view.file}`;
  const [cls, text] = view.errors.length
    ? ['alert', `${file} has errors · verification stays off`]
    : view.exists
      ? ['ok', `${file} · ${c?.run.length ?? 0} checks on every completion`]
      : ['', `No ${file} · completing a ticket closes it`];
  return (
    <SettingsSection title="Verification">
      <div className={`sync-line ${cls}`} title={view.hash}>
        <span className="dot" />
        <span>{text}</span>
      </div>
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
              props.map && `Mission ${props.map.key}: ${props.map.verification ?? 'off'}`,
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
