// M4 in the dev seed: the risk policy, the team's attention rules, a risky change made without asking, mission
// assumptions (two from the accepted brief, one challenged) and two pending proposals: a replan that freezes work,
// and a challenge to the second mission's destination. Everything goes through the same stores a real install uses.
import fs from 'node:fs';
import path from 'node:path';
import {
  addAssumptions,
  challengeAssumption,
  DEFAULT_POLICY,
  recordDecision,
  seedFromBrief,
  type DiscoveryBrief,
  type MapDoc,
  type TrackerAdapter,
  type VerificationAttempt,
} from '@miloops-hq/core';
import { journalFile, proposeReplan, writeAttempt, writePolicy } from '@miloops-hq/core/agents';

const MIN = 60_000;

interface SeedInput {
  root: string;
  adapter: TrackerAdapter;
  main: MapDoc;
  second: MapDoc;
  mainBrief: Pick<DiscoveryBrief, 'mapId' | 'sections'>;
  now: number;
}

export async function seedSupervision(input: SeedInput) {
  writeRules(input.root);
  await seedRiskyChange(input);
  await seedAssumptions(input);
  await seedReplan(input);
  await seedDestinationChallenge(input);
}

/** What always needs the human (policy.json) and how the team wants to be interrupted (attention.json). */
function writeRules(root: string) {
  writePolicy(root, {
    ...DEFAULT_POLICY,
    paths: [
      ...DEFAULT_POLICY.paths,
      { glob: 'api/openapi.yaml', level: 'high', category: 'breaking-api' },
      { glob: 'src/sync/**', level: 'medium', category: 'product-behaviour' },
    ],
  });
  const attention = { v: 1, interrupt: 70, digestMinutes: 120, weights: { knowledge: 20 } };
  fs.writeFileSync(path.join(root, 'attention.json'), `${JSON.stringify(attention, null, 2)}\n`);
}

const ticketByTitle = async (adapter: TrackerAdapter, mapId: string, title: string) => {
  const t = (await adapter.loadMap(mapId)).tickets.find((x) => x.title.startsWith(title));
  if (!t) throw new Error(`seed ticket "${title}" not found`);
  return t;
};

/**
 * codex-01 finished a task whose changes touch a migration (high risk) without asking: a policy item in the queue.
 * Its own call on the metrics client is medium risk, so it was allowed and recorded with its level.
 */
async function seedRiskyChange({ root, adapter, main, now }: SeedInput) {
  const t = await adapter.createTicket(main.id, {
    title: 'Add a sync_failures table for the failure counter',
    type: 'execute',
    hitl: false,
    body: 'Store each sync failure with its cause, so the failure rate can be charted.',
  });
  await adapter.assign(main.id, t.id, 'codex-01');
  await adapter.close(main.id, t.id, 'completed');
  const at = now - 50 * MIN;
  await recordDecision(
    adapter,
    main.id,
    {
      ticketId: t.id,
      ticketKey: t.key,
      question: 'Which client records the failure metrics?',
      answer: 'The existing metrics client in src/sync/metrics.ts; no new SDK.',
      summary: 'Failure metrics use the existing metrics client',
      alternatives: ['Add the vendor analytics SDK'],
      rationale: 'One less dependency, and the client already batches when offline.',
      decidedBy: 'codex-01',
      decidedAt: at,
      participants: [{ id: 'codex-01' }],
      source: { kind: 'agent', ref: 'seed-s-metrics', label: 'codex-01 session' },
      risk: { level: 'medium', category: 'dependencies', reason: 'dependencies is medium in the project policy' },
    },
    { appendToMission: false },
  );
  writeAttempt(root, attempt({ mapId: main.id, ticketId: t.id, ticketKey: t.key, at }));
}

function attempt(a: { mapId: string; ticketId: string; ticketKey: string; at: number }): VerificationAttempt {
  const check = (name: string, argv: string[]) => ({
    name,
    argv,
    cwd: '.',
    exitCode: 0,
    timedOut: false,
    durationMs: 41_000,
    log: `.evidence/${a.mapId}/${a.ticketId}/A-1/${name}.log`,
    tail: 'done',
    truncated: false,
  });
  return {
    v: 1,
    id: 'A-1',
    ...a,
    agent: 'codex-01',
    level: 'checks',
    configHash: 'seed',
    submittedAt: a.at,
    finishedAt: a.at + 2 * MIN,
    resolution: 'Added the sync_failures table and the counter that fills it.',
    checks: [check('typecheck', ['npm', 'run', 'typecheck']), check('test', ['npm', 'test'])],
    result: 'pass',
    git: {
      v: 1,
      changed: [
        { path: 'src/storage/migrations/0012_sync_failures.sql', add: 24, del: 0 },
        { path: 'src/sync/metrics.ts', add: 61, del: 4 },
      ],
      stats: { files: 2, add: 85, del: 4 },
      flags: [],
    },
  };
}

/** Two assumptions from the accepted brief (S-1, S-2), one more holding (S-3); S-2 is challenged with evidence. */
async function seedAssumptions({ adapter, main, mainBrief, now }: SeedInput) {
  await seedFromBrief(adapter, mainBrief);
  const spike = await ticketByTitle(adapter, main.id, 'Spike Automerge');
  const budget = await ticketByTitle(adapter, main.id, 'What is the storage budget');
  const queue = await ticketByTitle(adapter, main.id, 'Implement offline write queue');
  const survey = await ticketByTitle(adapter, main.id, 'Survey background-sync limits');
  const assumptions = (await adapter.loadMap(main.id)).map.sections.assumptions ?? [];
  const links: Record<string, string[]> = { 'brief:A-1': [spike.id, budget.id], 'brief:A-2': [queue.id] };
  const linked = assumptions.map((a) => ({ ...a, tickets: links[a.source ?? ''] ?? a.tickets }));
  await adapter.updateMapSections(main.id, { assumptions: linked });
  await addAssumptions(adapter, main.id, [
    { text: 'Background sync gets at least 30 seconds an hour on iOS', tickets: [survey.id] },
  ]);
  await challengeAssumption(adapter, main.id, {
    assumption: 'S-2',
    by: 'claude-02',
    at: now - 45 * MIN,
    evidence:
      '`src/api/notes.ts` only has a single-note PUT, and the gateway rejects bodies over 64 KB (`infra/gateway.yaml`: `max_body: 64k`). There is no batch endpoint to flush a queue into.',
  });
}

/** claude-02's replan: the write queue assumed a batch endpoint, so cancel it, add the endpoint, then the queue. */
async function seedReplan({ root, adapter, main, now }: SeedInput) {
  const queue = await ticketByTitle(adapter, main.id, 'Implement offline write queue');
  const adr = await ticketByTitle(adapter, main.id, 'Sign off sync protocol ADR');
  const rollout = await ticketByTitle(adapter, main.id, 'Approve rollout plan');
  await proposeReplan(
    { root, adapter, journal: journalFile(root) },
    {
      mapId: main.id,
      by: 'claude-02',
      at: now - 40 * MIN,
      kind: 'replan',
      reason: 'The notes API cannot take batches, so the write queue has nothing to flush into.',
      evidence: 'S-2 is wrong: single-note PUT only, 64 KB body limit at the gateway. See the challenge on S-2.',
      invalidates: ['S-2'],
      changes: [
        { op: 'cancel_ticket', ticket: queue.id, reason: 'Built on a batch endpoint that does not exist' },
        { op: 'add_ticket', ref: 'batch', title: 'Add a batch edits endpoint to the notes API', type: 'execute' },
        {
          op: 'add_ticket',
          ref: 'queue',
          title: 'Implement offline write queue on the batch endpoint',
          type: 'execute',
          blockedBy: ['batch', adr.id],
        },
        { op: 'rewire', ticket: rollout.id, addBlockedBy: ['queue'] },
      ],
    },
  );
}

/** On the second mission, discovery found most of the work already shipped: a challenge to the destination. */
async function seedDestinationChallenge({ root, adapter, second, now }: SeedInput) {
  const prior = await ticketByTitle(adapter, second.id, 'Prior art for team workspaces');
  await proposeReplan(
    { root, adapter, journal: journalFile(root) },
    {
      mapId: second.id,
      by: 'claude-02',
      at: now - 20 * MIN,
      kind: 'challenge-destination',
      destinationReason: 'already-exists',
      reason:
        'Organizations already give teams shared notebooks and an admin role; what is missing is self-serve members.',
      evidence:
        '`src/admin/orgs.ts` has organizations with members and an admin role since v3.2, and SSO maps each user to one (`src/auth/sso.ts:41`). Support tickets are all about adding and removing members.',
      invalidates: [],
      changes: [
        {
          op: 'update_destination',
          text: 'Admins add, remove and change the role of members in their organization themselves, without contacting support.',
        },
        { op: 'cancel_ticket', ticket: prior.id, reason: 'Organizations are the prior art, and they are ours' },
        { op: 'add_unspecified', text: 'Whether teams inside an organization are needed at all' },
      ],
    },
  );
}
