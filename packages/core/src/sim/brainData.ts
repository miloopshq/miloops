import type { TicketType } from '../model/types';

export const pick = <T>(xs: T[], seed: number) => xs[Math.abs(seed) % xs.length];
export const slug = (s: string, max: number) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max)
    .replace(/-$/, '');
export const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

export const TRACES: Record<TicketType, string[]> = {
  research: ['spawning research subagent', 'reading 14 sources', 'cross-checking vendor docs', 'summarising findings'],
  prototype: [
    'scaffolding throwaway branch',
    'running spike against fixture data',
    'measuring',
    'tearing down prototype',
  ],
  grilling: [
    'opening grilling session with operator',
    'question 1/3 answered',
    'question 2/3 answered',
    'question 3/3 answered',
  ],
  task: ['executing task', 'verifying output', 'attaching artefact link'],
  execute: ['checking out branch', 'implementing change set', 'running test suite', 'opening pull request'],
};

export const ANSWERS: Record<TicketType, string[]> = {
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
export const DETAILS: Record<TicketType, [string[], string][]> = {
  research: [
    [
      ['Background fetch on a fixed schedule', 'Silent push to wake the app'],
      'Both are throttled or dropped on iOS; foreground sync is the only path that is reliable on both platforms.',
    ],
    [
      ['Bespoke operation log', 'Last-write-wins with timestamps'],
      'Vector clocks are proven in comparable apps and keep the protocol small enough to audit.',
    ],
    [['Build in-house', 'Commercial SDK'], 'Licensing is clean and compaction is the cost driver on mobile storage.'],
  ],
  prototype: [
    [
      ['Keep REST request/response', 'Full CRDT without compaction'],
      'Measured on a mid-range Android device against fixture data; compaction brings storage under budget.',
    ],
    [
      ['Inline conflict markers', 'Modal conflict dialog'],
      'Hallway tests: users completed review faster and missed fewer conflicts with a queue.',
    ],
    [
      ['Single document per note', 'Attachments inline in the CRDT'],
      'Profiling showed attachment metadata dominating merge time.',
    ],
  ],
  grilling: [
    [
      ['Silent merge everywhere', 'Always ask on conflict'],
      'Text conflicts are cheap to merge; lost deletions are what users report as data loss.',
    ],
    [
      ['100 MB per device', 'No budget, warn only'],
      'Fits field devices with offline maps installed while leaving headroom for a week of notes.',
    ],
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
