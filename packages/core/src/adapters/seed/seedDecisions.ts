import type { MapSnapshot, TranscriptEntry } from '../../model/types';
import { recordDecision, supersedeDecision } from '../../planning/operations/decisionOps';
import type { TrackerAdapter } from '../adapter';
import { SEED_TICKETS } from './seedTickets';

const OP = 'operator';

/**
 * Decision history of the sample mission, written through `recordDecision` /
 * `supersedeDecision` like any live decision. `ticket` maps sample ticket ids
 * to the ids and keys the tracker assigned.
 */
export async function seedDecisions(
  adapter: TrackerAdapter,
  mapId: string,
  sample: MapSnapshot,
  ticket: (sampleId: string) => { id: string; key: string } | undefined = (id) => {
    const t = sample.tickets.find((x) => x.id === id);
    return t && { id: t.id, key: t.key };
  },
) {
  const at = (n: number) => sample.tickets.find((t) => t.key === `#${n}`)?.closedAt ?? sample.map.createdAt;
  const tk = (n: number) => {
    const t = ticket(`t-${n}`);
    return t ? { ticketId: t.id, ticketKey: t.key } : {};
  };
  const line = (n: number) => sample.map.sections.decisions.find((d) => d.ticketKey === `#${n}`)?.text;
  const say = (from: TranscriptEntry['from'], author: string, text: string, t: number): TranscriptEntry => ({
    from,
    author,
    text,
    at: t,
  });
  const mapFile = (n: number) => `${mapId}/tickets/${ticket(`t-${n}`)?.id ?? n}.md`;

  const t143 = at(143);
  await recordDecision(
    adapter,
    mapId,
    {
      ...tk(143),
      question: 'How do competing note apps handle offline conflicts?',
      answer: SEED_TICKETS.find((x) => x.n === 143)!.resolution!,
      summary: line(143),
      alternatives: ['Last-write-wins per note (Bear, Obsidian Sync)', 'Server-side three-way merge'],
      rationale:
        'Users already expect per-block merges from Notion; per-note last-write-wins silently drops concurrent edits in 3 of 4 tested apps.',
      decidedBy: 'claude-r1',
      decidedAt: t143,
      participants: [{ id: 'claude-r1' }],
      source: { kind: 'agent', ref: 'seed-s-143', label: 'claude-r1 session' },
    },
    { appendToMission: false },
  );

  const t144 = at(144);
  const first = await recordDecision(
    adapter,
    mapId,
    {
      ...tk(144),
      question: 'Who is the primary offline user?',
      answer: 'Commuters with patchy transit signal. Sync must survive a few hours offline.',
      alternatives: ['Field researchers with multi-day dead zones', 'Frequent flyers'],
      rationale: 'Support tickets about sync conflicts cluster around subway commutes.',
      decidedBy: OP,
      decidedAt: t144 - 5_400_000,
      participants: [{ id: 'claude-07' }, { id: OP }],
      source: { kind: 'command-center', ref: 'seed-s-144a', label: 'claude-07 conversation' },
      transcript: [
        say(
          'agent',
          'claude-07',
          'Grilling #144: "Who is the primary offline user?". Three questions, then I\'ll draft the decision.',
          t144 - 5_700_000,
        ),
        say('agent', 'claude-07', 'Who loses the most when sync fails today?', t144 - 5_650_000),
        say('human', OP, 'Commuters. Most conflict tickets mention the subway.', t144 - 5_600_000),
        say('agent', 'claude-07', 'How long is the longest offline stretch we must survive?', t144 - 5_560_000),
        say('human', OP, 'A few hours.', t144 - 5_500_000),
        say(
          'agent',
          'claude-07',
          'Draft resolution:\n\nCommuters with patchy transit signal. Sync must survive a few hours offline.\n\nRecord this and close #144?',
          t144 - 5_450_000,
        ),
        say('human', OP, 'Record it', t144 - 5_400_000),
      ],
    },
    { appendToMission: false },
  );
  await supersedeDecision(adapter, mapId, first.id, {
    answer: SEED_TICKETS.find((x) => x.n === 144)!.resolution!,
    summary: line(144),
    alternatives: ['Commuters with patchy transit signal'],
    rationale:
      'Interviews with six field teams: dead zones last 3 to 9 days, and lost field notes are unrecoverable. Commuter outages are covered by the same design.',
    decidedBy: 'mpocock',
    decidedAt: t144,
    participants: [{ id: 'mpocock' }, { id: OP }],
    source: { kind: 'tracker', ref: mapFile(144), label: 'edited in tracker' },
  });

  await recordDecision(
    adapter,
    mapId,
    {
      ...tk(145),
      question: 'CRDT vs last-write-wins cost on mobile storage',
      answer: SEED_TICKETS.find((x) => x.n === 145)!.resolution!,
      summary: line(145),
      alternatives: ['Last-write-wins with tombstones (~1.1x storage)', 'Yjs with custom persistence'],
      rationale:
        'Measured on 10k fixture notes. Only Automerge kept full history under budget after nightly compaction.',
      decidedBy: 'claude-r2',
      decidedAt: at(145),
      participants: [{ id: 'claude-r2' }],
      source: { kind: 'agent', ref: 'seed-s-145', label: 'claude-r2 session' },
    },
    { appendToMission: false },
  );

  await recordDecision(
    adapter,
    mapId,
    {
      ...tk(155),
      question: 'End-to-end encryption of sync payloads',
      answer: 'Out of scope: Transport is already TLS; at-rest E2EE is a separate initiative.',
      decidedBy: 'mpocock',
      decidedAt: at(155),
      participants: [{ id: 'mpocock' }],
      source: { kind: 'tracker', ref: mapFile(155), label: 'closed as not planned' },
    },
    { appendToMission: false },
  );

  const t0 = sample.map.createdAt + 3_000_000;
  await recordDecision(adapter, mapId, {
    question: 'Measure the current conflict rate before changing the protocol?',
    answer: 'Yes. Ship conflict telemetry first and keep the current protocol until we have a 30-day baseline.',
    summary: 'Baseline the conflict rate for 30 days before changing the protocol.',
    alternatives: ['Change the protocol now and measure after'],
    rationale: 'Without a baseline we cannot show the new sync is better.',
    decidedBy: OP,
    decidedAt: t0,
    participants: [{ id: 'claude-01' }, { id: OP }],
    source: { kind: 'command-center', ref: 'seed-s-chart', label: 'claude-01 conversation' },
    transcript: [
      say(
        'agent',
        'claude-01',
        'Before I chart tickets: do you want a baseline of the current conflict rate first?',
        t0 - 120_000,
      ),
      say('human', OP, 'Yes, 30 days. Keep the protocol as is until then.', t0),
    ],
  });
}
