import { RISK_LEVELS, type RiskCategory, type RiskLevel } from '@teamtrail/core';
import type { SelectOption } from '../components/ui/Select';

/** Plain names for the risk policy categories. */
export const RISK_CATEGORY_LABEL: Record<RiskCategory, string> = {
  schema: 'Database schema',
  'breaking-api': 'Breaking API changes',
  'auth-permissions': 'Auth and permissions',
  billing: 'Billing',
  'data-deletion': 'Deleting data',
  'product-behaviour': 'Product behaviour',
  dependencies: 'Dependencies',
};

const LEVEL_HINT: Record<RiskLevel, string> = {
  low: 'the agent decides',
  medium: 'the agent decides and records it',
  high: 'you decide',
};

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

export const RISK_LEVEL_OPTIONS: SelectOption<RiskLevel>[] = RISK_LEVELS.map((l) => ({
  value: l,
  label: capital(l),
  hint: LEVEL_HINT[l],
}));
