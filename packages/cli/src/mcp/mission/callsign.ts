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
