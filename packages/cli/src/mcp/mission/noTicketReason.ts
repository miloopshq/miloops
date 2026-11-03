import { deriveStates, type MapSnapshot, type TicketType } from '@miloops-hq/core';

/** Why next_ticket found nothing: the mission is decided, discovery holds implementation back, or what's in the way. */
export function noTicketReason(snap: MapSnapshot, discovery: { gate?: TicketType[]; next?: string }): string {
  const open = snap.tickets.filter((x) => x.state === 'open');
  if (!open.length) return 'Every ticket is closed: the mission is decided.';
  if (discovery.gate)
    return `No ready ${discovery.gate.join(', ')} ticket, and implementation tickets wait for the discovery brief: ${discovery.next}`;
  const states = deriveStates(snap.tickets, snap.map.mode);
  const count = (state: string) => open.filter((x) => states.get(x.id) === state).length;
  const waiting = [
    { label: 'verifying', n: count('verifying') },
    { label: 'waiting on the human', n: count('held') },
  ]
    .filter((w) => w.n > 0)
    .map((w) => `, ${w.n} ${w.label}`)
    .join('');
  return `No ready ticket: ${count('claimed')} claimed, ${count('blocked')} blocked, ${count('parked')} parked${waiting}.`;
}
