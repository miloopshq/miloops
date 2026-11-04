import type { TrackerAdapter } from '../adapters/adapter';
import type { MapSnapshot } from '../model/types';
import { frozenTickets } from '../planning/replan/frozenTickets';
import { listReplans } from '../planning/replan/replanStore';
import { replanTriggers } from '../planning/replan/replanTriggers';
import { DEFAULT_CONFIG } from '../verification/config';
import { readVerificationConfig } from '../verification/configFile';
import { readAttempts } from '../verification/evidenceStore';
import type { AttentionInput } from './types';

/**
 * What the replan sources read: every pending proposal with the tickets it freezes, and the triggers' suggestions,
 * fed from failed attempts, the `maxAttempts` setting and pull requests closed without merging.
 */
export async function replanInputs(input: {
  root: string;
  adapter: TrackerAdapter;
  snaps: MapSnapshot[];
  syncs: AttentionInput['syncs'];
}): Promise<Pick<AttentionInput, 'replans' | 'suggestions'>> {
  const { root, adapter, snaps, syncs } = input;
  const replans = snaps.flatMap((s) => pendingReplans(root, s.map.id));
  const maxAttempts = (readVerificationConfig(root).config ?? DEFAULT_CONFIG).maxAttempts;
  const closedUnmerged = syncs
    .filter((s) => s.flags.some((f) => f.kind === 'pr-closed-unmerged'))
    .map((s) => s.ticketId);
  const suggestions = await Promise.all(
    snaps.map(async (snap) =>
      replanTriggers({
        snap,
        decisions: await adapter.listDecisions(snap.map.id),
        failures: failuresOf(root, snap),
        maxAttempts,
        closedUnmerged,
      }),
    ),
  );
  return { replans, suggestions: suggestions.flat() };
}

function pendingReplans(root: string, mapId: string) {
  const pending = listReplans(root, mapId).filter((p) => p.status === 'pending');
  const frozen = frozenTickets(pending);
  return pending.map((proposal) => ({
    proposal,
    frozen: [...frozen].filter(([, id]) => id === proposal.id).map(([ticketId]) => ticketId),
  }));
}

/** Failed attempts per blocked ticket; only blocked tickets can trigger "blocked after attempts". */
function failuresOf(root: string, snap: MapSnapshot) {
  const blocked = snap.tickets.filter((t) => t.state === 'open' && t.status === 'blocked');
  const counts = blocked.map((t) => {
    const failed = readAttempts(root, snap.map.id, t.id).filter((a) => a.result === 'fail').length;
    return [t.id, failed] as const;
  });
  return Object.fromEntries(counts);
}
