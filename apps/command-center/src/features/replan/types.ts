import type { ReplanDiff, ReplanProposal } from '@miloops-hq/core';

/** A proposal as `/replans` serves it: pending ones carry their dry-run diff and the tickets they freeze. */
export type ReplanView = ReplanProposal & { diff?: ReplanDiff; frozen?: string[] };
