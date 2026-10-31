import type { MapSnapshot, Ticket } from '../model/types';
import { slug } from './brainData';

export interface Conversation {
  opening: string;
  questions: { text: string; suggestions?: string[] }[];
  draft(answers: string[]): string;
  /** Index of the question whose unchosen suggestions are the decision's alternatives. */
  decisive?: number;
  rationale?(answers: string[]): string;
}

/** Scripted HITL conversation for a ticket, by type. */
export function conversationFor(ticket: Ticket, snap: MapSnapshot): Conversation {
  const quote = (a: string) => a.replace(/\s+/g, ' ').trim().replace(/[.]$/, '');
  if (ticket.type === 'grilling') {
    return {
      opening: `Grilling ${ticket.key}: "${ticket.title}". Three questions, then I'll draft the decision.`,
      questions: [
        {
          text: 'What outcome would make this a clear yes for you?',
          suggestions: [
            'Users never lose an edit',
            'Fewer than 1% of syncs need manual review',
            'No extra taps in the common case',
          ],
        },
        {
          text: 'What is the worst failure you would accept in v1?',
          suggestions: [
            'A duplicated note the user can delete',
            'A slower first sync',
            'Conflicts surfaced in a review queue',
          ],
        },
        {
          text: 'Anything you want explicitly ruled out?',
          suggestions: ['No server-side merge for v1', 'No real-time presence', 'Nothing else'],
        },
      ],
      decisive: 0,
      rationale: (a) =>
        `Worst acceptable v1 failure: ${quote(a[1]).toLowerCase()}. Explicitly ruled out: ${quote(a[2]).toLowerCase()}.`,
      draft: (a) =>
        `Decided with operator: success means ${quote(a[0]).toLowerCase()}. Acceptable v1 failure: ${quote(a[1]).toLowerCase()}. Ruled out: ${quote(a[2]).toLowerCase()}.`,
    };
  }
  if (ticket.type === 'prototype') {
    const n = ticket.key.replace(/\D/g, '');
    const branch = `spike/${n}-${slug(ticket.title, 28)}`;
    const preview = `https://spike-${n}.${slug(snap.map.title, 24)}.pages.dev`;
    return {
      opening: `Prototype for ${ticket.key} is up on branch ${branch}. Preview build: ${preview}`,
      questions: [
        {
          text: 'I ran the spike against the fixture data: it holds at 10k records with a 140 ms cold start. Good enough to build on, or should I push further first?',
          suggestions: ['Good enough, build on it', 'Push on the slowest path first', 'Try the alternative approach'],
        },
        {
          text: 'Anything in the preview that felt off?',
          suggestions: ['Cold start felt slow', 'Error states are unclear', 'Nothing, it felt solid'],
        },
      ],
      decisive: 0,
      rationale: (a) => `Operator reviewed the preview build (${preview}). Notes: ${quote(a[1]).toLowerCase()}.`,
      draft: (a) =>
        `Prototype reviewed with operator: ${quote(a[0]).toLowerCase()}. Notes: ${quote(a[1]).toLowerCase()}.`,
    };
  }
  if (ticket.type === 'execute') {
    return {
      opening: `Executing ${ticket.key}: "${ticket.title}". The change is ready on a branch; I need two calls from you before merging.`,
      questions: [
        {
          text: 'Ship it behind the flag now, or wait for the next release train?',
          suggestions: ['Ship behind the flag now', 'Wait for the release train'],
        },
        {
          text: 'Any area you want me to double-check before the PR goes up?',
          suggestions: ['Migration rollback', 'Battery impact', 'Nothing, go ahead'],
        },
      ],
      decisive: 0,
      rationale: (a) =>
        `Change set ready on a branch; operator asked for an extra check on ${quote(a[1]).toLowerCase()}.`,
      draft: (a) => `Executed with operator: ${quote(a[0]).toLowerCase()}; extra check: ${quote(a[1]).toLowerCase()}.`,
    };
  }
  return {
    opening: `${ticket.key} needs a human: "${ticket.title}". I've prepared everything; I need your sign-off.`,
    questions: [
      {
        text: 'I have summarised the decisions so far into the doc. Do you approve it as written?',
        suggestions: ['Approved', 'Approved with minor edits', 'Not yet — needs changes'],
      },
      {
        text: 'Who else needs to sign off before we proceed?',
        suggestions: ['Nobody else', 'Mobile lead', 'Security review'],
      },
    ],
    decisive: 0,
    rationale: (a) => `Sign-off chain: ${quote(a[1]).toLowerCase()}.`,
    draft: (a) => `Operator sign-off: ${quote(a[0]).toLowerCase()}. Additional sign-off: ${quote(a[1]).toLowerCase()}.`,
  };
}
