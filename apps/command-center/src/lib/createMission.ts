import { BRAND, chartMap, DISCOVERY_TICKET, type Assumption, type TrackerAdapter } from '@miloops-hq/core';

/**
 * A mission started from the command center: the map with its destination, notes and assumptions, plus the
 * discovery ticket and an empty brief. Any agent picks it up with `/milo resume`; MILOOPS still never starts one
 * locally.
 */
export async function createMission(
  adapter: TrackerAdapter,
  input: { title: string; destination: string; notes: string; assumptions?: string[] },
) {
  const assumptions = (input.assumptions ?? []).map((text, i): Assumption => ({
    id: `S-${i + 1}`,
    text,
    status: 'holding',
    tickets: [],
  }));
  const { map, tickets } = await chartMap(adapter, {
    title: input.title,
    sections: {
      destination: input.destination,
      notes: input.notes,
      decisions: [],
      unspecified: [],
      outOfScope: [],
      ...(assumptions.length ? { assumptions } : {}),
    },
    tickets: [{ ref: 'discovery', ...DISCOVERY_TICKET }],
  });
  await fetch(`${BRAND.apiPrefix}/briefs/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapId: map.id, ticketId: tickets[0]?.id }),
  });
  return map;
}
