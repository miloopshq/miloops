import type { RiskLevel, RiskPathRule } from '@miloops-hq/core';
import { useState } from 'react';
import { Button, Select } from '../../components/ui';
import { RISK_LEVEL_OPTIONS } from '../../lib/riskPolicy';

/** Files that carry a level whatever the agent says the call is about, e.g. `**\/migrations/**`. */
export function RiskPathRules(props: { rules: RiskPathRule[]; onChange: (rules: RiskPathRule[]) => void }) {
  const [glob, setGlob] = useState('');
  const [level, setLevel] = useState<RiskLevel>('high');
  const { rules, onChange } = props;
  const add = () => {
    const g = glob.trim();
    if (!g || rules.some((r) => r.glob === g)) return;
    onChange([...rules, { glob: g, level }]);
    setGlob('');
  };
  return (
    <div className="risk-paths">
      <span className="mono-label">Files</span>
      {rules.map((r, i) => (
        <div key={r.glob} className="risk-row">
          <code>{r.glob}</code>
          <Select
            compact
            aria-label={`${r.glob} risk`}
            value={r.level}
            options={RISK_LEVEL_OPTIONS}
            onChange={(l) => onChange(rules.map((x, j) => (j === i ? { ...x, level: l } : x)))}
          />
          <button
            className="icon-btn"
            aria-label={`Remove ${r.glob}`}
            onClick={() => onChange(rules.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <div className="risk-row">
        <input
          value={glob}
          placeholder="src/payments/**"
          aria-label="New file pattern"
          onChange={(e) => setGlob(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <Select compact aria-label="New pattern risk" value={level} options={RISK_LEVEL_OPTIONS} onChange={setLevel} />
        <Button onClick={add} disabled={!glob.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}
