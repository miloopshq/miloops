import { AGENT_INTEGRATIONS } from '@teamtrail/core';

/** Trail name family for a connected client: `claude-code` → `claude`. */
export function trailNameFamily(client?: string) {
  const name = (client ?? '').toLowerCase();
  const known = AGENT_INTEGRATIONS.find((a) => name.includes(a.trailName) || name.includes(a.id));
  if (known) return known.trailName;
  return (
    name
      .split(/[^a-z0-9]+/)
      .find(Boolean)
      ?.slice(0, 12) || 'agent'
  );
}
