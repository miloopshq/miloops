import type { RiskLevel } from '../model/risk';
import type { DecisionRecord } from '../model/types';

export type RiskGroupLevel = RiskLevel | 'none';

export interface RiskGroup {
  level: RiskGroupLevel;
  /** Short label for the group, e.g. "Medium risk". */
  label: string;
  decisions: DecisionRecord[];
}

const ORDER: { level: RiskGroupLevel; label: string }[] = [
  { level: 'high', label: 'High risk' },
  { level: 'medium', label: 'Medium risk' },
  { level: 'low', label: 'Low risk' },
  { level: 'none', label: 'No category' },
];

/** Decisions grouped by their policy level, riskiest first; empty groups are left out. Order within a group is kept. */
export function decisionsByRisk(decisions: DecisionRecord[]): RiskGroup[] {
  return ORDER.map((g) => ({ ...g, decisions: decisions.filter((d) => (d.risk?.level ?? 'none') === g.level) })).filter(
    (g) => g.decisions.length,
  );
}
