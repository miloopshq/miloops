import type { ChartPlan } from '../planning/operations';
import type { MapSnapshot, Ticket, TicketType } from '../model/types';

/**
 * Decisions an agent makes while running a procedure. The simulated
 * brain returns canned content; a real one would be an LLM session.
 */
export interface AgentBrain {
  planMap(input: { title: string; destination: string }): Promise<ChartPlan>;
  /** AFK resolution: progress lines emitted while resolving, then the answer. */
  resolve(ticket: Ticket, snap: MapSnapshot): { trace: string[]; answer: string; alternatives: string[]; rationale: string };
  /** HITL resolution: a scripted conversation with the human, then a drafted answer. */
  converse(ticket: Ticket, snap: MapSnapshot): Conversation;
  /** After recording, optionally promote an unspecified item or rule one out. */
  planMove(snap: MapSnapshot): { kind: 'graduate'; unspecified: string; type: TicketType; blockedBy: string[] } | { kind: 'rule'; unspecified: string; reason: string } | null;
}

export interface Conversation {
  opening: string;
  questions: { text: string; suggestions?: string[] }[];
  draft(answers: string[]): string;
  /** Index of the question whose unchosen suggestions are the decision's alternatives. */
  decisive?: number;
  rationale?(answers: string[]): string;
}

const pick = <T,>(xs: T[], seed: number) => xs[Math.abs(seed) % xs.length];
const slug = (s: string, max: number) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, max).replace(/-$/, '');
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

const TRACES: Record<TicketType, string[]> = {
  research: ['spawning research subagent', 'reading 14 sources', 'cross-checking vendor docs', 'summarising findings'],
  prototype: ['scaffolding throwaway branch', 'running spike against fixture data', 'measuring', 'tearing down prototype'],
  grilling: ['opening grilling session with operator', 'question 1/3 answered', 'question 2/3 answered', 'question 3/3 answered'],
  task: ['executing task', 'verifying output', 'attaching artefact link'],
  execute: ['checking out branch', 'implementing change set', 'running test suite', 'opening pull request'],
};

const ANSWERS: Record<TicketType, string[]> = {
  research: [
    'Platform limits cap background sync at ~30s every 15 min on iOS; Android WorkManager is more generous. Design for opportunistic foreground sync.',
    'Prior art converges on per-record vector clocks with server tombstones. No need for a bespoke protocol.',
    'Two viable libraries exist; both are MIT licensed and actively maintained. Prefer the one with a compaction API.',
  ],
  prototype: [
    'Spike holds 10k notes at 140 ms cold start and 2.1x storage. Viable with nightly compaction.',
    'Queue-based review tested better than inline markers in 5/6 hallway tests. Go with a review queue.',
    'Prototype shows merge cost is dominated by attachment metadata, not text. Split them into separate documents.',
  ],
  grilling: [
    'Operator confirmed: silent merge is fine for text, but deletions must always surface for review.',
    'Budget agreed at 200 MB per device, with a warning at 150 MB.',
    'Shared notebooks are rare (<3%); optimise for single-author and accept a slower path for shared.',
  ],
  task: [
    'Done. Dashboard shows 4.2% of sessions hit a sync conflict over the last 30 days.',
    'ADR written and merged; links attached in the ticket.',
    'Feature flag created with staged rollout 1% → 10% → 100%.',
  ],
  execute: [
    'Implemented behind flag `offline_queue`; 42 tests added, CI green. PR opened for review.',
    'Change set landed on a branch with migration + rollback script. PR opened.',
  ],
};

/** Alternatives weighed and the reason, index-aligned with ANSWERS. */
const DETAILS: Record<TicketType, [string[], string][]> = {
  research: [
    [['Background fetch on a fixed schedule', 'Silent push to wake the app'], 'Both are throttled or dropped on iOS; foreground sync is the only path that is reliable on both platforms.'],
    [['Bespoke operation log', 'Last-write-wins with timestamps'], 'Vector clocks are proven in comparable apps and keep the protocol small enough to audit.'],
    [['Build in-house', 'Commercial SDK'], 'Licensing is clean and compaction is the cost driver on mobile storage.'],
  ],
  prototype: [
    [['Keep REST request/response', 'Full CRDT without compaction'], 'Measured on a mid-range Android device against fixture data; compaction brings storage under budget.'],
    [['Inline conflict markers', 'Modal conflict dialog'], 'Hallway tests: users completed review faster and missed fewer conflicts with a queue.'],
    [['Single document per note', 'Attachments inline in the CRDT'], 'Profiling showed attachment metadata dominating merge time.'],
  ],
  grilling: [
    [['Silent merge everywhere', 'Always ask on conflict'], 'Text conflicts are cheap to merge; lost deletions are what users report as data loss.'],
    [['100 MB per device', 'No budget, warn only'], 'Fits field devices with offline maps installed while leaving headroom for a week of notes.'],
    [['Treat shared notebooks as the main case'], 'Usage data shows shared notebooks are a small minority.'],
  ],
  task: [
    [['Sample client logs instead'], 'Server-side metrics already cover every session.'],
    [['Keep decisions in tickets only'], 'An ADR is the durable record reviewers expect.'],
    [['Big-bang release', 'Per-user opt-in beta'], 'Staged percentages let us watch conflict rate before widening.'],
  ],
  execute: [
    [['Ship without a flag'], 'The flag gives an instant rollback while the queue is new.'],
    [['Migrate in place without rollback'], 'A rollback script keeps the release reversible.'],
  ],
};

export function simulatedBrain(): AgentBrain {
  return {
    async planMap({ title, destination }) {
      const subject = title.replace(/^(ship|build|add|launch)\s+/i, '');
      return {
        title,
        sections: {
          destination,
          notes: 'Charted from the command center. Initial frontier proposed by the simulated agent.',
          decisions: [],
          unspecified: [`Pricing implications of ${subject}`, 'Migration path for existing users', 'Observability and alerting', 'Accessibility review'],
          outOfScope: ['Native desktop clients — later phase'],
        },
        tickets: [
          { ref: 'a', type: 'grilling', title: `Who is the primary user of ${subject}?`, body: 'Pin down the primary persona before designing.' },
          { ref: 'b', type: 'research', title: `Prior art for ${subject}`, body: 'Survey how comparable products solve this.' },
          { ref: 'c', type: 'research', title: 'Technical constraints and platform limits', body: 'What hard limits apply?' },
          { ref: 'd', type: 'prototype', title: 'Spike the riskiest integration point', body: 'Throwaway spike to de-risk.', blockedBy: ['b', 'c'] },
          { ref: 'e', type: 'grilling', title: 'What does "done" look like for v1?', body: 'Agree acceptance criteria.', blockedBy: ['a'] },
          { ref: 'f', type: 'task', title: 'Write the design doc', body: 'Consolidate decisions into a design doc.', blockedBy: ['d', 'e'] },
          { ref: 'g', type: 'execute', title: 'Implement the v1 slice behind a flag', body: 'Carry out the decided design.', blockedBy: ['f'] },
          { ref: 'h', type: 'task', hitl: true, title: 'Approve rollout and measurement plan', body: 'Flagged rollout with success metrics.', blockedBy: ['g'] },
        ],
      };
    },
    resolve(ticket) {
      const h = hash(ticket.id + ticket.title);
      const i = Math.abs(h) % ANSWERS[ticket.type].length;
      const [alternatives, rationale] = DETAILS[ticket.type][i] ?? [[], ''];
      return { trace: TRACES[ticket.type], answer: ANSWERS[ticket.type][i], alternatives, rationale };
    },
    converse(ticket, snap) {
      const quote = (a: string) => a.replace(/\s+/g, ' ').trim().replace(/[.]$/, '');
      if (ticket.type === 'grilling') {
        return {
          opening: `Grilling ${ticket.key}: "${ticket.title}". Three questions, then I'll draft the decision.`,
          questions: [
            { text: 'What outcome would make this a clear yes for you?', suggestions: ['Users never lose an edit', 'Fewer than 1% of syncs need manual review', 'No extra taps in the common case'] },
            { text: 'What is the worst failure you would accept in v1?', suggestions: ['A duplicated note the user can delete', 'A slower first sync', 'Conflicts surfaced in a review queue'] },
            { text: 'Anything you want explicitly ruled out?', suggestions: ['No server-side merge for v1', 'No real-time presence', 'Nothing else'] },
          ],
          decisive: 0,
          rationale: (a) => `Worst acceptable v1 failure: ${quote(a[1]).toLowerCase()}. Explicitly ruled out: ${quote(a[2]).toLowerCase()}.`,
          draft: (a) => `Decided with operator: success means ${quote(a[0]).toLowerCase()}. Acceptable v1 failure: ${quote(a[1]).toLowerCase()}. Ruled out: ${quote(a[2]).toLowerCase()}.`,
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
            { text: 'Anything in the preview that felt off?', suggestions: ['Cold start felt slow', 'Error states are unclear', 'Nothing, it felt solid'] },
          ],
          decisive: 0,
          rationale: (a) => `Operator reviewed the preview build (${preview}). Notes: ${quote(a[1]).toLowerCase()}.`,
          draft: (a) => `Prototype reviewed with operator: ${quote(a[0]).toLowerCase()}. Notes: ${quote(a[1]).toLowerCase()}.`,
        };
      }
      if (ticket.type === 'execute') {
        return {
          opening: `Executing ${ticket.key}: "${ticket.title}". The change is ready on a branch; I need two calls from you before merging.`,
          questions: [
            { text: 'Ship it behind the flag now, or wait for the next release train?', suggestions: ['Ship behind the flag now', 'Wait for the release train'] },
            { text: 'Any area you want me to double-check before the PR goes up?', suggestions: ['Migration rollback', 'Battery impact', 'Nothing, go ahead'] },
          ],
          decisive: 0,
          rationale: (a) => `Change set ready on a branch; operator asked for an extra check on ${quote(a[1]).toLowerCase()}.`,
          draft: (a) => `Executed with operator: ${quote(a[0]).toLowerCase()}; extra check: ${quote(a[1]).toLowerCase()}.`,
        };
      }
      return {
        opening: `${ticket.key} needs a human: "${ticket.title}". I've prepared everything; I need your sign-off.`,
        questions: [
          { text: 'I have summarised the decisions so far into the doc. Do you approve it as written?', suggestions: ['Approved', 'Approved with minor edits', 'Not yet — needs changes'] },
          { text: 'Who else needs to sign off before we proceed?', suggestions: ['Nobody else', 'Mobile lead', 'Security review'] },
        ],
        decisive: 0,
        rationale: (a) => `Sign-off chain: ${quote(a[1]).toLowerCase()}.`,
        draft: (a) => `Operator sign-off: ${quote(a[0]).toLowerCase()}. Additional sign-off: ${quote(a[1]).toLowerCase()}.`,
      };
    },
    planMove(snap) {
      const unspecified = snap.map.sections.unspecified;
      if (!unspecified.length) return null;
      const h = hash(unspecified.join('|') + snap.tickets.length);
      const item = pick(unspecified, h);
      if (h % 4 === 0) return { kind: 'rule', unspecified: item, reason: 'not needed to reach the destination' };
      const open = snap.tickets.filter((t) => t.state === 'open');
      const dep = open.length ? [pick(open, h).id] : [];
      return { kind: 'graduate', unspecified: item, type: pick<TicketType>(['research', 'prototype', 'task', 'grilling', 'execute'], h >> 3), blockedBy: h % 3 === 0 ? [] : dep };
    },
  };
}
