import type { MapSnapshot, RerouteChange } from '@teamtrail/core';

/**
 * Names tickets the way the trail lead knows them: an existing ticket by its key (`#4`), a ticket the proposal adds by
 * `new: <title>`. Anything unknown is shown as given.
 */
export function ticketNamer(snap: MapSnapshot, changes: RerouteChange[]) {
  const keys = new Map(snap.tickets.map((t) => [t.id, t.key]));
  const added = new Map(changes.flatMap((c) => (c.op === 'add_ticket' ? [[c.ref, c.title] as const] : [])));
  return (idOrRef: string) => {
    const key = keys.get(idOrRef);
    if (key) return key;
    const title = added.get(idOrRef);
    return title ? `new: ${title}` : idOrRef;
  };
}
