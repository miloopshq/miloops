import { BRAND, chartMap, DISCOVERY_TICKET, type TrackerAdapter } from '@miloops-hq/core';

/**
 * A mission started from the command center: the map with its destination and notes, plus the discovery ticket
 * and an empty brief. Any agent picks it up with `/milo resume`; MILOOPS still never starts one locally.
 */
export async function createMission(
  adapter: TrackerAdapter,
  input: { title: string; destination: string; notes: string },
) {
  const { map, tickets } = await chartMap(adapter, {
    title: input.title,
    sections: { destination: input.destination, notes: input.notes, decisions: [], unspecified: [], outOfScope: [] },
    tickets: [{ ref: 'discovery', ...DISCOVERY_TICKET }],
  });
  await fetch(`${BRAND.apiPrefix}/briefs/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapId: map.id, ticketId: tickets[0]?.id }),
  });
  return map;
}
