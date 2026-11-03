import type { RiskPolicy } from '../model/risk';

/** Used when the project has no `.miloops/policy.json`, and for categories a policy file leaves out. */
export const DEFAULT_POLICY: RiskPolicy = {
  v: 1,
  categories: {
    schema: 'high',
    'breaking-api': 'high',
    'auth-permissions': 'high',
    billing: 'high',
    'data-deletion': 'high',
    'product-behaviour': 'medium',
    dependencies: 'medium',
  },
  paths: [
    { glob: '**/migrations/**', level: 'high', category: 'schema' },
    { glob: '**/*.sql', level: 'high', category: 'schema' },
    { glob: '**/auth/**', level: 'high', category: 'auth-permissions' },
    { glob: '**/billing/**', level: 'high', category: 'billing' },
    { glob: 'package.json', level: 'medium', category: 'dependencies' },
    { glob: '**/package.json', level: 'medium', category: 'dependencies' },
  ],
};
