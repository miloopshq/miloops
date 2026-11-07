import type { RerouteDiff, RerouteProposal } from '@teamtrail/core';

/** A proposal as `/reroutes` serves it: pending ones carry their dry-run diff and the tickets they freeze. */
export type RerouteView = RerouteProposal & { diff?: RerouteDiff; frozen?: string[] };
