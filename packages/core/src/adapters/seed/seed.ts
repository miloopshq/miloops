import type { TrackerAdapter } from '../adapter';
import { recordDecision, supersedeDecision } from '../../planning/operations';
import type { UsageLedger } from '../../activity/presence';
import type { MapSnapshot, Ticket, TicketType, TranscriptEntry } from '../../model/types';

type SeedTicket = {
  n: number;
  title: string;
  type: TicketType;
  hitl?: boolean;
  blockedBy?: number[];
  status?: 'decided' | 'claimed' | 'ruled';
  assignee?: string;
  resolution?: string;
};

const T: SeedTicket[] = [
  { n: 143, type: 'research', title: 'How do competing note apps handle offline conflicts?', status: 'decided',
    resolution: 'Bear and Obsidian Sync use last-write-wins per note; Notion queues edits and merges per block. Per-block merge is the bar users expect.' },
  { n: 144, type: 'grilling', title: 'Who is the primary offline user?', status: 'decided',
    resolution: 'Field researchers with multi-day dead zones, not commuters. Sync must survive a week offline.' },
  { n: 145, type: 'research', title: 'CRDT vs last-write-wins cost on mobile storage', blockedBy: [143], status: 'decided',
    resolution: 'Automerge history adds ~1.8x storage after compaction. Acceptable under a 200 MB budget.' },
  { n: 146, type: 'prototype', title: 'Spike Automerge on React Native with 10k notes', blockedBy: [145], status: 'claimed', assignee: 'mpocock' },
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

/** A mid-flight demo map: some decisions made, one ticket claimed, a live frontier and unspecified items. */
export function demoSnapshot(now = Date.now()): MapSnapshot {
  const id = (n: number) => `t-${n}`;
  const tickets: Ticket[] = T.map((s, i) => {
    const createdAt = now - (T.length - i) * 3_600_000;
    const comments = s.resolution
      ? [{ id: `c-${s.n}`, author: 'claude-07', body: `**Resolution**\n\n${s.resolution}`, createdAt: createdAt + 1_800_000 }]
      : s.status === 'ruled'
        ? [{ id: `c-${s.n}`, author: 'mpocock', body: '**Ruled out of scope**\n\nTransport is already TLS; at-rest E2EE is a separate initiative.', createdAt }]
        : [];
    return {
      id: id(s.n),
      key: `#${s.n}`,
      title: s.title,
      type: s.type,
      hitl: s.hitl,
      body: `Decision ticket for the Fieldnote offline sync mission.\n\nPart of mission #142.`,
      state: s.status === 'decided' || s.status === 'ruled' ? 'closed' : 'open',
      closeReason: s.status === 'decided' ? 'completed' : s.status === 'ruled' ? 'not_planned' : undefined,
      assignee: s.assignee,
      blockedBy: (s.blockedBy ?? []).map(id),
      comments,
      createdAt,
      updatedAt: createdAt,
      closedAt: s.status === 'decided' || s.status === 'ruled' ? createdAt + 1_800_000 : undefined,
    };
  });
  return {
    map: {
      id: 'map-142',
      key: '#142',
      title: 'Offline-first sync for Fieldnote',
      mode: 'plan+execute',
      createdAt: now - 20 * 3_600_000,
      updatedAt: now,
      sections: {
        destination:
          'Fieldnote mobile users can capture and edit notes for a week with no signal, and every edit merges cleanly when they reconnect.',
        notes:
          'Current sync is request/response over REST; ~4% of sessions hit a conflict dialog. Mobile is React Native. Backend is Postgres + a Node API.',
        decisions: T.filter((s) => s.resolution).map((s) => ({
          ticketId: id(s.n),
          ticketKey: `#${s.n}`,
          text: s.resolution!.split('. ')[0].replace(/\.$/, '') + '.',
        })),
        unspecified: [
          'Attachments and photo sync',
          'Multi-device presence indicators',
          'Server-side merge for legacy API clients',
          'Quota enforcement when a device exceeds budget',
          'Audit log of merged edits',
          'Desktop app parity',
        ],
        outOfScope: [
          '#155 End-to-end encryption of sync payloads — separate initiative',
          'Real-time collaborative cursors — single-author notes',
          'Web client offline support — mobile first',
        ],
      },
    },
    tickets,
  };
}

/**
 * Recreate a snapshot through tracker primitives (ids/keys are reassigned by
 * the tracker). Used to load the sample map into a real tracker.
 */
export async function seedSnapshot(adapter: TrackerAdapter, demo: MapSnapshot = demoSnapshot()) {
  const map = await adapter.createMap({ title: demo.map.title, mode: demo.map.mode, sections: { ...demo.map.sections, decisions: [], outOfScope: [] } });
  const ids = new Map<string, string>();
  for (const t of demo.tickets) {
    const created = await adapter.createTicket(map.id, { title: t.title, type: t.type, hitl: t.hitl, body: t.body.replace(demo.map.key, map.key) });
    ids.set(t.id, created.id);
  }
  for (const t of demo.tickets) for (const b of t.blockedBy) await adapter.addBlocking(map.id, ids.get(b)!, ids.get(t.id)!);
  for (const t of demo.tickets) {
    const id = ids.get(t.id)!;
    for (const c of t.comments) await adapter.comment(map.id, id, c.author, c.body);
    if (t.assignee) await adapter.assign(map.id, id, t.assignee);
    if (t.state === 'closed') await adapter.close(map.id, id, t.closeReason ?? 'completed');
  }
  const loaded = (await adapter.loadMap(map.id)).tickets;
  const keys = new Map(loaded.map((t) => [t.id, t.key]));
  const rekey = (s: string) => s.replace(/#\d+/g, (k) => {
    const old = demo.tickets.find((t) => t.key === k);
    return old ? keys.get(ids.get(old.id)!) ?? k : k;
  });
  await adapter.updateMapSections(map.id, {
    decisions: demo.map.sections.decisions.map((d) => ({ ...d, ticketId: d.ticketId && ids.get(d.ticketId), ticketKey: d.ticketId && keys.get(ids.get(d.ticketId)!) })),
    outOfScope: demo.map.sections.outOfScope.map(rekey),
  });
  await seedDecisions(adapter, map.id, demo, (oldId) => {
    const id = ids.get(oldId);
    return id ? { id, key: keys.get(id)! } : undefined;
  });
  return map;
}

const OP = 'operator';

/**
 * Decision history of the sample mission, written through `recordDecision` /
 * `supersedeDecision` like any live decision. `ticket` maps sample ticket ids
 * to the ids and keys the tracker assigned.
 */
export async function seedDecisions(
  adapter: TrackerAdapter,
  mapId: string,
  demo: MapSnapshot,
  ticket: (demoId: string) => { id: string; key: string } | undefined = (id) => {
    const t = demo.tickets.find((x) => x.id === id);
    return t && { id: t.id, key: t.key };
  },
) {
  const at = (n: number) => demo.tickets.find((t) => t.key === `#${n}`)?.closedAt ?? demo.map.createdAt;
  const tk = (n: number) => {
    const t = ticket(`t-${n}`);
    return t ? { ticketId: t.id, ticketKey: t.key } : {};
  };
  const line = (n: number) => demo.map.sections.decisions.find((d) => d.ticketKey === `#${n}`)?.text;
  const say = (from: TranscriptEntry['from'], author: string, text: string, t: number): TranscriptEntry => ({ from, author, text, at: t });
  const mapFile = (n: number) => `${mapId}/tickets/${ticket(`t-${n}`)?.id ?? n}.md`;

  const t143 = at(143);
  await recordDecision(
    adapter,
    mapId,
    {
      ...tk(143),
      question: 'How do competing note apps handle offline conflicts?',
      answer: T.find((x) => x.n === 143)!.resolution!,
      summary: line(143),
      alternatives: ['Last-write-wins per note (Bear, Obsidian Sync)', 'Server-side three-way merge'],
      rationale: 'Users already expect per-block merges from Notion; per-note last-write-wins silently drops concurrent edits in 3 of 4 tested apps.',
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
        say('agent', 'claude-07', 'Grilling #144: "Who is the primary offline user?". Three questions, then I\'ll draft the decision.', t144 - 5_700_000),
        say('agent', 'claude-07', 'Who loses the most when sync fails today?', t144 - 5_650_000),
        say('human', OP, 'Commuters. Most conflict tickets mention the subway.', t144 - 5_600_000),
        say('agent', 'claude-07', 'How long is the longest offline stretch we must survive?', t144 - 5_560_000),
        say('human', OP, 'A few hours.', t144 - 5_500_000),
        say('agent', 'claude-07', 'Draft resolution:\n\nCommuters with patchy transit signal. Sync must survive a few hours offline.\n\nRecord this and close #144?', t144 - 5_450_000),
        say('human', OP, 'Record it', t144 - 5_400_000),
      ],
    },
    { appendToMission: false },
  );
  await supersedeDecision(adapter, mapId, first.id, {
    answer: T.find((x) => x.n === 144)!.resolution!,
    summary: line(144),
    alternatives: ['Commuters with patchy transit signal'],
    rationale: 'Interviews with six field teams: dead zones last 3 to 9 days, and lost field notes are unrecoverable. Commuter outages are covered by the same design.',
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
      answer: T.find((x) => x.n === 145)!.resolution!,
      summary: line(145),
      alternatives: ['Last-write-wins with tombstones (~1.1x storage)', 'Yjs with custom persistence'],
      rationale: 'Measured on 10k fixture notes. Only Automerge kept full history under budget after nightly compaction.',
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

  const t0 = demo.map.createdAt + 3_000_000;
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
      say('agent', 'claude-01', 'Before I chart tickets: do you want a baseline of the current conflict rate first?', t0 - 120_000),
      say('human', OP, 'Yes, 30 days. Keep the protocol as is until then.', t0),
    ],
  });
}

/**
 * Usage the sample mission's past sessions reported, written into the ledger
 * at the times those sessions ran (charting, then each decided ticket).
 */
export function seedUsage(ledger: UsageLedger, demo: MapSnapshot = demoSnapshot()) {
  const rate = (i: number, o: number) => ({ inputTokens: i, outputTokens: o, costUsd: i * (3 / 1e6) + o * (15 / 1e6) });
  ledger.add(demo.map.id, rate(212_400, 13_900), 'seed-s-chart', demo.map.createdAt + 600_000);
  const tokens: Partial<Record<TicketType, [number, number]>> = { research: [386_000, 21_700], grilling: [148_500, 9_300], prototype: [522_000, 38_400] };
  for (const t of demo.tickets) {
    const k = tokens[t.type];
    if (!k || t.closeReason !== 'completed' || !t.closedAt) continue;
    ledger.add(demo.map.id, rate(k[0], k[1]), `seed-s-${t.key.slice(1)}`, t.closedAt - 900_000);
  }
}
