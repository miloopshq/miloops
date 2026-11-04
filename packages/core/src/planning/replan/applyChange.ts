import type { TrackerAdapter } from '../../adapters/adapter';
import type { Journal } from '../../model/lifecycle';
import type { ReplanChange, ReplanProposal } from '../../model/replan';
import type { MapSnapshot } from '../../model/types';
import { supersedeDecision } from '../operations/decisionOps';
import { ruleOutOfScope } from '../operations/scope';

/** Who applies a proposal: the operator who approved it, journaled like their other actions. */
export interface ApplyEnv {
  adapter: TrackerAdapter;
  /** Actor id of the approver. */
  actor: string;
  journal?: Journal;
  /** Persists the proposal after every step, so an interrupted apply resumes where it stopped. */
  save(p: ReplanProposal): void | Promise<void>;
}

/** One change, with the proposal it belongs to and the ids of the tickets the proposal created. */
export interface Step {
  env: ApplyEnv;
  p: ReplanProposal;
  index: number;
  /** Resolves a ticket id or a new ref to a real ticket id. */
  idOf: (ref: string) => string;
}

/** The line each ticket or comment a proposal writes ends with; finding it again makes every step idempotent. */
export const replanMark = (p: Pick<ReplanProposal, 'id'>, index: number) => `replan ${p.id} (change ${index + 1})`;

/** Applies a change's effect other than creating tickets (done before, by the caller). Safe to run twice. */
export async function applyChange(s: Step, c: ReplanChange): Promise<void> {
  const { env, p } = s;
  const mapId = p.mapId;
  const snap = await env.adapter.loadMap(mapId);
  switch (c.op) {
    case 'add_ticket':
      return wire(s, s.idOf(c.ref), c.blockedBy ?? []);
    case 'rewire':
      return wire(s, c.ticket, c.addBlockedBy);
    case 'cancel_ticket':
      return cancel(s, snap, c);
    case 'edit_ticket':
      return revise(s, snap, c);
    case 'supersede_decision':
      return supersede(s, c);
    case 'update_destination':
      return env.adapter.updateMapSections(mapId, { destination: c.text.trim() });
    case 'add_unspecified':
      return appendLine(s, snap, { key: 'unspecified', text: c.text });
    case 'add_out_of_scope':
      return appendLine(s, snap, { key: 'outOfScope', text: c.text });
    case 'reopen':
      return;
    default: {
      const unknown: never = c;
      throw new Error(`unknown change ${(unknown as { op?: string }).op}`);
    }
  }
}

async function wire(s: Step, ticketId: string, blockers: string[]) {
  for (const b of blockers) await s.env.adapter.addBlocking(s.p.mapId, s.idOf(b), ticketId);
}

async function cancel(s: Step, snap: MapSnapshot, c: Extract<ReplanChange, { op: 'cancel_ticket' }>) {
  const t = snap.tickets.find((x) => x.id === c.ticket);
  if (!t || t.state === 'closed') return;
  await ruleOutOfScope(
    s.env.adapter,
    s.p.mapId,
    { ticketId: t.id },
    {
      reason: `${c.reason} (${replanMark(s.p, s.index)})`,
      author: s.env.actor,
      actorKind: 'operator',
      journal: s.env.journal,
      source: { kind: 'command-center', label: `replan ${s.p.id}`, ref: `${s.p.mapId}/${s.p.id}/${s.index}` },
    },
  );
}

async function revise(s: Step, snap: MapSnapshot, c: Extract<ReplanChange, { op: 'edit_ticket' }>) {
  const t = snap.tickets.find((x) => x.id === c.ticket);
  const mark = replanMark(s.p, s.index);
  if (!t || t.comments.some((x) => x.body.includes(mark))) return;
  const parts = [
    `**Revised by ${mark}**, approved by ${s.env.actor}`,
    ...(c.title?.trim() ? [`**Title:** ${c.title.trim()}`] : []),
    ...(c.body?.trim() ? [c.body.trim()] : []),
  ];
  await s.env.adapter.comment(s.p.mapId, t.id, s.p.by, parts.join('\n\n'));
}

async function supersede(s: Step, c: Extract<ReplanChange, { op: 'supersede_decision' }>) {
  const old = (await s.env.adapter.listDecisions(s.p.mapId)).find((d) => d.id === c.decision);
  if (!old || old.supersededBy) return;
  await supersedeDecision(s.env.adapter, s.p.mapId, old.id, {
    answer: c.answer,
    rationale: c.rationale,
    decidedBy: s.env.actor,
    participants: [{ id: s.p.by }, { id: s.env.actor }],
    source: { kind: 'command-center', label: `replan ${s.p.id}`, ref: `${s.p.mapId}/${s.p.id}/${s.index}` },
  });
}

async function appendLine(s: Step, snap: MapSnapshot, line: { key: 'unspecified' | 'outOfScope'; text: string }) {
  const current = snap.map.sections[line.key];
  const text = line.text.trim();
  if (current.includes(text)) return;
  await s.env.adapter.updateMapSections(s.p.mapId, { [line.key]: [...current, text] });
}
