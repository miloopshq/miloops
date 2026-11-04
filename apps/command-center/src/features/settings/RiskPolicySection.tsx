import { BRAND, RISK_CATEGORIES, type RiskPolicy } from '@miloops-hq/core';
import { useState } from 'react';
import { Select } from '../../components/ui';
import { RISK_CATEGORY_LABEL, RISK_LEVEL_OPTIONS } from '../../lib/riskPolicy';
import { RiskPathRules } from './RiskPathRules';
import { SettingsSection } from './SettingsSection';
import { usePolicy } from './usePolicy';

/** What agents may decide on their own. MILOOPS never decides for you: the policy only limits the agents. */
export function RiskPolicySection() {
  const { view, save } = usePolicy();
  const [error, setError] = useState<string>();
  if (!view) return null;
  const file = `${BRAND.dataDir}/policy.json`;
  const change = (policy: RiskPolicy) => {
    setError(undefined);
    save(policy).then(setError, (e: Error) => setError(e.message));
  };
  return (
    <SettingsSection title="Risk policy">
      <p className="vf-intro">
        What agents may decide on their own. High: they must ask you. Medium: they decide, follow your conventions and
        record it for you to review. Low: they just decide.
      </p>
      <div className="risk-grid">
        {RISK_CATEGORIES.map((c) => (
          <label key={c} className="risk-row">
            <span>{RISK_CATEGORY_LABEL[c]}</span>
            <Select
              compact
              aria-label={`${RISK_CATEGORY_LABEL[c]} risk`}
              value={view.policy.categories[c]}
              options={RISK_LEVEL_OPTIONS}
              onChange={(level) => change({ ...view.policy, categories: { ...view.policy.categories, [c]: level } })}
            />
          </label>
        ))}
      </div>
      <RiskPathRules rules={view.policy.paths} onChange={(paths) => change({ ...view.policy, paths })} />
      {view.errors.length > 0 && (
        <>
          <div className="sync-line alert">
            <span className="dot" />
            <span>{file} has errors, so the defaults apply until it is fixed.</span>
          </div>
          <ul className="vf-errors">
            {view.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </>
      )}
      {view.defaults && view.errors.length === 0 && (
        <span className="set-hint t-meta">Defaults. Changing anything saves {file}, so your team shares it.</span>
      )}
      {error && <span className="vf-err">{error}</span>}
    </SettingsSection>
  );
}
