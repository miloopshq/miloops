import type { DestinationReason, ReplanChange } from '@miloops-hq/core';

/** Why the destination is challenged, in plain words. */
export const DESTINATION_WORDS: Record<DestinationReason, string> = {
  'already-exists': 'The work already exists',
  'wrong-problem': 'The mission targets the wrong problem',
  rescope: 'The mission should be rescoped',
};

/** One change in plain words: a short verb for the tag, the line itself, and an optional detail under it. */
export interface ChangeText {
  verb: string;
  text: string;
  detail?: string;
}

/** Describes a change; `name` turns a ticket id or a new ticket's ref into what the operator sees (`#4`, a title). */
export function describeChange(c: ReplanChange, name: (idOrRef: string) => string): ChangeText {
  switch (c.op) {
    case 'add_ticket': {
      const after = c.blockedBy?.length ? `after ${c.blockedBy.map(name).join(', ')}` : undefined;
      return { verb: 'Add', text: `${c.type}: ${c.title}`, detail: after };
    }
    case 'cancel_ticket':
      return { verb: 'Cancel', text: name(c.ticket), detail: c.reason };
    case 'edit_ticket':
      return { verb: 'Revise', text: name(c.ticket), detail: c.title ? `New title: ${c.title}` : 'New description' };
    case 'rewire':
      return {
        verb: 'Rewire',
        text: name(c.ticket),
        detail: `now also after ${c.addBlockedBy.map(name).join(', ')}`,
      };
    case 'supersede_decision':
      return { verb: 'Supersede', text: c.decision, detail: `${c.answer}. ${c.rationale}` };
    case 'update_destination':
      return { verb: 'Destination', text: c.text };
    case 'add_unspecified':
      return { verb: 'Not yet specified', text: c.text };
    case 'add_out_of_scope':
      return { verb: 'Out of scope', text: c.text };
    case 'reopen':
      return { verb: 'Reopen', text: name(c.ticket), detail: c.reason };
    default: {
      const unknown: never = c;
      return unknown;
    }
  }
}
