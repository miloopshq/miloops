import type { TicketType } from '../../model/types';

export type SeedTicket = {
  n: number;
  title: string;
  type: TicketType;
  hitl?: boolean;
  blockedBy?: number[];
  status?: 'decided' | 'claimed' | 'ruled';
  assignee?: string;
  resolution?: string;
};

/** The sample mission's tickets by issue number; decided ones carry the resolution recorded for them. */
export const SEED_TICKETS: SeedTicket[] = [
  {
    n: 143,
    type: 'research',
    title: 'How do competing note apps handle offline conflicts?',
    status: 'decided',
    resolution:
      'Bear and Obsidian Sync use last-write-wins per note; Notion queues edits and merges per block. Per-block merge is the bar users expect.',
  },
  {
    n: 144,
    type: 'grilling',
    title: 'Who is the primary offline user?',
    status: 'decided',
    resolution: 'Field researchers with multi-day dead zones, not commuters. Sync must survive a week offline.',
  },
  {
    n: 145,
    type: 'research',
    title: 'CRDT vs last-write-wins cost on mobile storage',
    blockedBy: [143],
    status: 'decided',
    resolution: 'Automerge history adds ~1.8x storage after compaction. Acceptable under a 200 MB budget.',
  },
  {
    n: 146,
    type: 'prototype',
    title: 'Spike Automerge on React Native with 10k notes',
    blockedBy: [145],
    status: 'claimed',
    assignee: 'mpocock',
  },
  { n: 147, type: 'grilling', title: 'Is silent auto-merge acceptable for shared notebooks?', blockedBy: [144] },
  { n: 148, type: 'research', title: 'Survey background-sync limits on iOS and Android', blockedBy: [144] },
  { n: 149, type: 'task', title: 'Instrument current sync failure rate in production' },
  { n: 150, type: 'prototype', title: 'Conflict review UI: inline vs queue', blockedBy: [147] },
  { n: 151, type: 'grilling', title: 'What is the storage budget per device?', blockedBy: [146] },
  { n: 152, type: 'task', title: 'Sign off sync protocol ADR', hitl: true, blockedBy: [146, 150] },
  { n: 153, type: 'research', title: 'Schema migration strategy for offline clients', blockedBy: [151, 148] },
  { n: 154, type: 'task', title: 'Approve rollout plan behind a feature flag', hitl: true, blockedBy: [156, 153] },
  { n: 155, type: 'research', title: 'End-to-end encryption of sync payloads', status: 'ruled' },
  { n: 156, type: 'execute', title: 'Implement offline write queue behind a flag', blockedBy: [152] },
];
