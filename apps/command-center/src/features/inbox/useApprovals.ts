import type { ApprovalItem, MapSnapshot } from '@miloops-hq/core';
import { useEffect, useState } from 'react';
import { prSync } from '../../lib';
import { verificationApi } from '../../lib/verification';

/** Tickets waiting on the operator, reloaded when evidence changes or a ticket moves. */
export function useApprovals(snaps: Record<string, MapSnapshot>): ApprovalItem[] {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const moved = Object.values(snaps)
    .map((s) => s.tickets.map((t) => `${t.id}:${t.state}:${t.status ?? ''}`).join())
    .join('|');
  useEffect(() => {
    let live = true;
    const load = () => void verificationApi.inbox().then((x) => live && setItems(x));
    load();
    const off = prSync.onEvidence(load);
    return () => {
      live = false;
      off();
    };
  }, [moved]);
  return items;
}
