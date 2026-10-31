import type { TrackerAdapter } from '../../adapters/adapter';
import type { ActorKind, VerificationLevel } from '../../model/lifecycle';
import { OperationError } from '../operations/operationError';

export interface VerificationTarget {
  mapId: string;
  /** Unset: the mission level. */
  ticketId?: string;
}

/**
 * Sets or clears (`null`) the verification level of a ticket or mission.
 * Operator only: an agent must not be able to lower what verifies its own work.
 */
export async function setVerification(
  adapter: TrackerAdapter,
  target: VerificationTarget,
  level: VerificationLevel | null,
  actorKind: ActorKind,
) {
  if (actorKind !== 'operator') throw new OperationError('only the operator can change a verification level');
  if (target.ticketId) await adapter.setMeta(target.mapId, target.ticketId, { verification: level });
  else await adapter.setMapMeta(target.mapId, { verification: level });
}
