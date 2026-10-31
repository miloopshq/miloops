import { AGENT_INTEGRATIONS } from '@miloops-hq/core';

/** Callsign family for a connected client: `claude-code` → `claude`. */
export function callsignFamily(client?: string) {
  const name = (client ?? '').toLowerCase();
  const known = AGENT_INTEGRATIONS.find((a) => name.includes(a.callsign) || name.includes(a.id));
  if (known) return known.callsign;
  return (
    name
      .split(/[^a-z0-9]+/)
      .find(Boolean)
      ?.slice(0, 12) || 'agent'
  );
}

/** First free `<family>-NN` callsign. */
export function freeCallsign(family: string, taken: Set<string>) {
  let n = 1;
  while (taken.has(`${family}-${String(n).padStart(2, '0')}`)) n++;
  return `${family}-${String(n).padStart(2, '0')}`;
}
