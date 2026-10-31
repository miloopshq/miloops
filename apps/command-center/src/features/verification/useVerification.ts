import { useCallback, useEffect, useState } from 'react';
import { prSync } from '../../lib';
import { type TicketVerification, verificationApi } from '../../lib/verification';

/**
 * A ticket's verification record, reloaded on every evidence change (SSE `verification`, `kind: 'evidence'`)
 * and whenever `version` changes (the tracker saw the ticket move).
 * Undefined while loading and without a local server.
 */
export function useVerification(mapId: string, ticketId: string, version: number) {
  const [data, setData] = useState<TicketVerification>();
  const reload = useCallback(() => {
    void verificationApi.ticket(mapId, ticketId).then(setData);
  }, [mapId, ticketId]);
  useEffect(() => {
    setData(undefined);
    reload();
    return prSync.onEvidence(reload);
  }, [reload]);
  useEffect(reload, [reload, version]);
  return { data, reload };
}
