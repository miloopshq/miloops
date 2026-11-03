import type { ReplanChange, ReplanProposal } from '../../model/replan';
import type { MapSnapshot, Ticket } from '../../model/types';
import { applyChange, replanMark, type ApplyEnv, type Step } from './applyChange';
import { reopenTitle } from './replanDiff';

export type { ApplyEnv } from './applyChange';

/**
 * Executes an approved proposal through the existing operations. First every ticket it adds is created (and its id
 * kept in `created`), then each change runs in order and its index goes into `applied`; the proposal is saved after
 * each step. Running it again on an interrupted proposal finishes the rest without creating anything twice: a ticket
 * whose create landed but whose save didn't is found again by the replan line in its body.
 */
export async function applyReplan(env: ApplyEnv, proposal: ReplanProposal): Promise<ReplanProposal> {
  let p: ReplanProposal = { ...proposal, applied: [...proposal.applied], created: { ...proposal.created } };
  for (const [index, c] of p.changes.entries()) {
    if (p.created[index] || !creates(c)) continue;
    const id = await createFor(env, p, index, c);
    p = { ...p, created: { ...p.created, [index]: id } };
    await env.save(p);
  }
  const idOf = refResolver(p);
  for (const [index, c] of p.changes.entries()) {
    if (p.applied.includes(index)) continue;
    const step: Step = { env, p, index, idOf };
    await applyChange(step, c);
    p = { ...p, applied: [...p.applied, index] };
    await env.save(p);
  }
  return p;
}

const creates = (c: ReplanChange) => c.op === 'add_ticket' || c.op === 'reopen';

/** A new ref resolves to the ticket its add_ticket created; anything else is a ticket id already. */
function refResolver(p: ReplanProposal) {
  const byRef = new Map<string, string>();
  p.changes.forEach((c, i) => {
    if (c.op === 'add_ticket' && p.created[i]) byRef.set(c.ref, p.created[i]);
  });
  return (ref: string) => byRef.get(ref) ?? ref;
}

async function createFor(env: ApplyEnv, p: ReplanProposal, index: number, c: ReplanChange): Promise<string> {
  const snap = await env.adapter.loadMap(p.mapId);
  const mark = replanMark(p, index);
  const landed = snap.tickets.find((t) => t.body.includes(mark));
  if (landed) return landed.id;
  const input = ticketInput(snap, p, c);
  const t = await env.adapter.createTicket(p.mapId, {
    ...input,
    body: `${input.body}\n\nAdded by ${mark}. Part of mission ${snap.map.key}.`,
  });
  return t.id;
}

function ticketInput(
  snap: MapSnapshot,
  p: ReplanProposal,
  c: ReplanChange,
): Pick<Ticket, 'title' | 'type' | 'hitl' | 'body'> {
  if (c.op === 'add_ticket') return { title: c.title, type: c.type, hitl: c.hitl, body: c.body?.trim() || p.reason };
  if (c.op !== 'reopen') throw new Error(`${c.op} creates no ticket`);
  const old = snap.tickets.find((t) => t.id === c.ticket);
  if (!old) throw new Error(`ticket ${c.ticket} not found`);
  return {
    title: reopenTitle(old),
    type: old.type,
    hitl: old.hitl,
    body: `Picks ${old.key} up again: ${c.reason}\n\nOriginal: ${old.title}`,
  };
}
