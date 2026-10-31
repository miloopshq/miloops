/**
 * The product name lives here and nowhere else. Renaming the product means
 * editing this file (plus the npm package scope, which npm cannot read from code).
 * Changing `slug` also changes tracker labels, so existing maps would need relabelling.
 */
const slug = 'miloops';

export const BRAND = {
  slug,
  /** Display name for HUD headings. */
  name: 'MILOOPS',
  category: 'Autonomous Agent Command Center',
  tagline: 'One command center. Every agent. Total operational awareness.',
  /** The platform's own voice: coordinator/system lines and onboarding. Worker agents keep their own ids. */
  assistant: {
    name: 'MILO',
    expansion: 'Mission Intelligence & Logistics Operator',
  },
  /** Our own tracker label prefix: `<prefix>:map`, `<prefix>:research`, ... Follows the product name. */
  labelPrefix: slug,
  /** Default folder (relative to where the app is started) for the local-markdown tracker. */
  dataDir: `.${slug}`,
  /** Dev-server route prefix for the markdown file bridge. */
  apiPrefix: `/__${slug}`,
  /** Env var overriding the markdown data folder. */
  dataDirEnv: `${slug.toUpperCase()}_DIR`,
} as const;

/** UI preference storage key. */
export const PREFS_KEY = `${slug}.prefs`;

export const label = (kind: string) => `${BRAND.labelPrefix}:${kind}`;
export const MAP_LABEL = label('map');
export const HITL_LABEL = label('hitl');
export const PLAN_ONLY_LABEL = label('plan-only');
