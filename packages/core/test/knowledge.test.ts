import { describe, expect, it } from 'vitest';
import {
  applyCall,
  globMatch,
  parseKnowledge,
  pathsIn,
  searchKnowledge,
  selectKnowledge,
  serializeKnowledge,
  splitForImport,
  staleAnchors,
  withCurrentHashes,
  type KnowledgeEntry,
} from '../src';

const t0 = Date.UTC(2026, 10, 3);

function entry(id: string, patch: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id,
    title: `Entry ${id}`,
    body: 'Body',
    kind: 'fact',
    status: 'confirmed',
    scope: [],
    tags: [],
    sources: [],
    anchors: [],
    createdBy: 'claude-01',
    createdAt: t0,
    updatedAt: t0,
    ...patch,
  };
}

describe('knowledge entries', () => {
  it('round-trip through their markdown file', () => {
    const e = entry('K-3', {
      title: 'SMS needs consent: always',
      body: 'Never send SMS to a client without consent.\n\nSee `src/notify/preferences.ts`.',
      kind: 'business-rule',
      status: 'assumption',
      scope: ['src/notify/**'],
      tags: ['sms', 'consent'],
      sources: ['trail:#1', 'decision:D-4'],
      anchors: [{ path: 'src/notify/preferences.ts', hash: 'abc123' }, { path: 'docs/x.md' }],
      flag: { by: 'codex-02', reason: 'Consent moved to accounts', at: t0 + 1000 },
    });
    expect(parseKnowledge('K-3', serializeKnowledge(e))).toEqual(e);
  });

  it('only the trail lead calls change status; edits keep what they do not touch', () => {
    const e = entry('K-1', { status: 'suggested', flag: { by: 'a', reason: 'r', at: t0 } });
    expect(applyCall(e, { kind: 'confirm' }, t0 + 1)).toMatchObject({ status: 'confirmed', updatedAt: t0 + 1 });
    expect(applyCall(e, { kind: 'confirm' }).flag).toBeUndefined();
    expect(applyCall(e, { kind: 'assumption' }).status).toBe('assumption');
    expect(applyCall(e, { kind: 'outdated' }).status).toBe('outdated');
    expect(applyCall(e, { kind: 'resolve-flag' })).toMatchObject({ status: 'suggested', flag: undefined });
    expect(applyCall(e, { kind: 'edit', title: 'New', tags: ['x'] })).toMatchObject({
      title: 'New',
      body: 'Body',
      tags: ['x'],
    });
  });

  it('match path globs', () => {
    expect(globMatch('src/notify/**', 'src/notify/service.ts')).toBe(true);
    expect(globMatch('src/notify/**', 'src/notifyx/a.ts')).toBe(false);
    expect(globMatch('src/*.ts', 'src/a.ts')).toBe(true);
    expect(globMatch('src/*.ts', 'src/x/a.ts')).toBe(false);
    expect(globMatch('**/migrations/**', 'db/migrations/001.sql')).toBe(true);
    expect(globMatch('**/migrations/**', 'migrations/001.sql')).toBe(true);
    expect(globMatch('**/migrations/**', 'db/foomigrations/001.sql')).toBe(false);
    expect(globMatch('src/**/*.ts', 'src/a.ts')).toBe(true);
    expect(globMatch('src/**/*.ts', 'src/x/y/a.ts')).toBe(true);
  });

  it('search ranks paths, tags and words, and hides retired entries', () => {
    const all = [
      entry('K-1', { title: 'Jobs register in the registry', scope: ['src/jobs/**'] }),
      entry('K-2', { title: 'SMS costs money', tags: ['sms'] }),
      entry('K-3', { title: 'Old SMS provider', status: 'outdated', tags: ['sms'] }),
    ];
    expect(searchKnowledge(all, { tags: ['sms'] }).map((e) => e.id)).toEqual(['K-2']);
    expect(searchKnowledge(all, { tags: ['sms'], includeOutdated: true }).map((e) => e.id)).toEqual(['K-2', 'K-3']);
    expect(searchKnowledge(all, { paths: ['src/jobs/scheduler.ts'] }).map((e) => e.id)).toEqual(['K-1']);
    expect(searchKnowledge(all, { query: 'registry' }).map((e) => e.id)).toEqual(['K-1']);
  });

  it('splits a spec into suggestions by heading', () => {
    const parts = splitForImport(
      '# Spec\n\nintro\n\n## Personas\n\nTherapists.\n\n## Empty\n\n## Pricing\n\nPro is $20.',
      'spec.md',
    );
    expect(parts).toEqual([
      { title: 'Personas', body: 'Therapists.', sources: ['import:spec.md'] },
      { title: 'Pricing', body: 'Pro is $20.', sources: ['import:spec.md'] },
    ]);
  });
});

describe('selectKnowledge', () => {
  const all = [
    entry('K-1', { title: 'Notifications go through NotifyService', kind: 'convention', scope: ['src/notify/**'] }),
    entry('K-2', { title: 'SMS needs consent', kind: 'business-rule' }),
    entry('K-3', { title: 'Reminder jobs overlap', kind: 'gotcha', tags: ['reminder'] }),
    entry('K-4', { title: 'Unreviewed idea', status: 'suggested', kind: 'business-rule' }),
    entry('K-5', { title: 'Retired', status: 'outdated', kind: 'convention' }),
    entry('K-6', { title: 'Therapists book weekly', kind: 'persona', sources: ['trail:#1'] }),
    entry('K-7', { title: 'Unrelated fact', kind: 'fact', scope: ['src/billing/**'] }),
  ];
  const ctx = {
    trailKey: '#1',
    ticket: { type: 'execute', title: 'Build the reminder scheduler', body: 'Use `src/notify/service.ts`.' },
    paths: ['src/notify/service.ts'],
  };

  it('picks live, relevant entries with a reason, best first, deterministically', () => {
    const picked = selectKnowledge(all, ctx);
    expect(picked.map((k) => k.id)).toEqual(['K-1', 'K-3', 'K-6', 'K-2']);
    expect(picked[0].why).toEqual(['path match src/notify/** (src/notify/service.ts)']);
    expect(picked.find((k) => k.id === 'K-2')?.why).toEqual(['business rule for the whole project']);
    expect(picked.find((k) => k.id === 'K-6')?.why).toEqual(['same trail']);
    expect(picked.some((k) => ['K-4', 'K-5', 'K-7'].includes(k.id))).toBe(false);
    expect(selectKnowledge(all, ctx)).toEqual(picked);
  });

  it('puts product knowledge first for discovery, and respects the budget', () => {
    const picked = selectKnowledge(all, { ...ctx, discovery: true });
    expect(picked.map((k) => k.id).slice(0, 2)).toEqual(['K-6', 'K-2']);
    const long = all.map((e) => ({ ...e, body: 'x'.repeat(500) }));
    expect(selectKnowledge(long, ctx, 900).length).toBe(1);
  });

  it('marks entries whose anchored files changed', () => {
    const anchored = [entry('K-1', { kind: 'convention', anchors: [{ path: 'a.ts', hash: 'h1' }, { path: 'b.ts' }] })];
    expect(staleAnchors(anchored[0], () => 'h1')).toEqual([]);
    expect(staleAnchors(anchored[0], () => 'h2')).toEqual(['a.ts']);
    expect(staleAnchors(anchored[0], () => undefined)).toEqual(['a.ts']);
    expect(staleAnchors(entry('K-9'), () => 'x')).toEqual([]);
    expect(withCurrentHashes(anchored[0], (p) => `${p}-now`).anchors).toEqual([
      { path: 'a.ts', hash: 'a.ts-now' },
      { path: 'b.ts', hash: 'b.ts-now' },
    ]);
    const picked = selectKnowledge(anchored, { paths: [] }, 4000, () => ['a.ts']);
    expect(picked[0].mayBeOutdated).toEqual(['a.ts']);
  });

  it('finds paths in free text', () => {
    expect(
      pathsIn('- `src/notify/service.ts`: sends\nNew endpoints under /api/reminders; jobs in src/jobs/registry.ts.'),
    ).toEqual(['src/notify/service.ts', 'api/reminders', 'src/jobs/registry.ts']);
  });
});
