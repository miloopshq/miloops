/**
 * The product name lives here and nowhere else. Renaming the product means
 * editing this file (plus the package.json names, which npm cannot read from code).
 * Changing `slug` also changes tracker labels, so existing maps would need relabelling.
 */
import type { TicketType } from './types';

const slug = 'miloops';

export const BRAND = {
  slug,
  /** The npm package (`npx teamtrail`, `npm i -g teamtrail`). Its command is still `miloops`. */
  npm: 'teamtrail',
  /** Display name for HUD headings. */
  name: 'MILOOPS',
  /** Two-tone wordmark: `lead + ops` spells `name`; `ops` renders in the brand amber. */
  wordmark: { lead: 'MILO', ops: 'OPS' },
  category: 'Local command center for AI coding agents',
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
/** Types whose HITL flag is a choice (and so a label): grilling and prototype are always HITL, research never. */
export const takesHitlLabel = (type: TicketType) => type === 'task' || type === 'execute';
export const PLAN_ONLY_LABEL = label('plan-only');
