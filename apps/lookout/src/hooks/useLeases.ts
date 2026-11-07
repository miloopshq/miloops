import type { TicketLease } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import type { Runtime } from '../lib';

/** Claim leases of connected agents, live. */
export function useLeases(rt: Runtime): TicketLease[] {
  const [leases, setLeases] = useState(rt.leases.leases);
  useEffect(() => rt.leases.subscribe(setLeases), [rt]);
  return leases;
}
