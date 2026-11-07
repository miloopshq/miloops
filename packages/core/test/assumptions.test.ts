import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Assumption, type MapSections, MemoryAdapter, chartMap, parseMapBody, serializeMapBody } from '../src';
import { splitBody, mapBody } from '../src/adapters/remote/format';
import { journalFile } from '../src/history/journalFile';
import { addAssumptions, challengeAssumption, seedFromBrief } from '../src/planning/assumptions/assumptionOps';

const SECTIONS: MapSections = {
  destination: 'Clients get the reminders they asked for.',
  notes: 'Push first.',
  decisions: [{ ticketKey: '#1', text: 'Use the notify service' }],
  unspecified: ['Quiet hours'],
  outOfScope: ['Email'],
};

const challenged: Assumption = {
  id: 'S-2',
  text: 'SMS is cheap',
  status: 'challenged',
  tickets: ['4'],
  source: 'brief:A-1',
  challenge: {
    by: 'codex-02',
    at: 1_700_000_000_000,
    evidence: 'Pricing page --> $0.05/msg\nper segment',
    ticketId: '4',
  },
};

describe('assumptions in the map body', () => {
  it('round-trip with their ids, links and challenge, even when the evidence holds a comment end', () => {
    const s = {
      ...SECTIONS,
      assumptions: [{ id: 'S-1', text: 'Push is on', status: 'holding', tickets: [] }, challenged],
    };
    const body = serializeMapBody(s as MapSections);
    expect(body).toContain('## Assumptions\n\n- [holding] Push is on <!-- teamtrail:asm');
    expect(body).not.toContain('per segment --> ');
    expect(parseMapBody(body)).toEqual(s);
  });

  it('leave maps without assumptions byte-for-byte as before', () => {
    const body = serializeMapBody(SECTIONS);
    expect(body).not.toContain('Assumptions');
    expect(parseMapBody(body)).toEqual(SECTIONS);
    expect(serializeMapBody(parseMapBody(body))).toBe(body);
  });

  it('survive the remote issue body next to the meta marker', () => {
    const sections = { ...SECTIONS, assumptions: [challenged] };
    const { text, meta } = splitBody(mapBody({ sections, verification: 'checks' }));
    expect(meta.verification).toBe('checks');
    expect(parseMapBody(text).assumptions).toEqual([challenged]);
  });

  it('parse hand-written lines: no status holds, no marker gets the next free id', () => {
    const body = `## Destination\n\nX\n\n## Assumptions\n\n- [confirmed] A <!-- teamtrail:asm {"id":"S-4","tickets":[]} -->\n- B\n- [challenged] C\n`;
    expect(parseMapBody(body).assumptions).toEqual([
      { id: 'S-4', text: 'A', status: 'confirmed', tickets: [] },
      { id: 'S-5', text: 'B', status: 'holding', tickets: [] },
      { id: 'S-6', text: 'C', status: 'challenged', tickets: [] },
    ]);
  });
});

describe('assumption operations', () => {
  const memory = () => new MemoryAdapter({ latency: [0, 0] });

  it('seed from the accepted brief once, then challenge with evidence and name what depends on it', async () => {
    const a = memory();
    const { map, tickets } = await chartMap(a, {
      title: 'Reminders',
      sections: SECTIONS,
      tickets: [{ ref: 'b', title: 'Build', type: 'execute', body: '' }],
    });
    const brief = {
      mapId: map.id,
      sections: {
        assumptions: [
          { id: 'A-1', text: 'Push is on' },
          { id: 'A-2', text: 'SMS is cheap' },
        ],
      },
    };
    expect((await seedFromBrief(a, brief as never)).map((x) => x.id)).toEqual(['S-1', 'S-2']);
    expect(await seedFromBrief(a, brief as never)).toEqual([]);
    await addAssumptions(a, map.id, [{ text: 'sms is cheap' }, { text: 'Jobs run hourly', tickets: [tickets[0].id] }]);
    await a.createDecision(map.id, {
      question: 'q',
      answer: 'a',
      decidedBy: 'x',
      source: { kind: 'agent' },
      assumes: ['S-3'],
    });
    const r = await challengeAssumption(a, map.id, {
      assumption: 'S-3',
      evidence: 'cron says */5',
      by: 'claude-01',
      at: 5,
    });
    expect(r.assumption).toMatchObject({
      status: 'challenged',
      challenge: { by: 'claude-01', evidence: 'cron says */5' },
    });
    expect(r.tickets).toEqual([tickets[0].id]);
    expect(r.decisions).toEqual(['D-1']);
    const after = (await a.loadMap(map.id)).map.sections.assumptions!;
    expect(after.map((x) => `${x.id} ${x.source ?? ''} ${x.status}`)).toEqual([
      'S-1 brief:A-1 holding',
      'S-2 brief:A-2 holding',
      'S-3  challenged',
    ]);
    await expect(challengeAssumption(a, map.id, { assumption: 'S-9', evidence: 'x', by: 'c' })).rejects.toThrow(
      /unknown/,
    );
  });
});

describe('the journal with reroute entries', () => {
  let root: string;
  beforeEach(() => (root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-journal-'))));
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('loads old and new lines together; read() keeps returning transitions only', () => {
    const file = path.join(root, '.events', 'm1.jsonl');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const old = {
      v: 1,
      mapId: 'm1',
      ticketId: '1',
      ticketKey: '#1',
      event: 'claim',
      from: 'ready',
      to: 'working',
      actor: 'a',
      actorKind: 'agent',
      at: 1,
    };
    const future = { v: 1, kind: 'something-new', mapId: 'm1', at: 2 };
    fs.writeFileSync(file, `${JSON.stringify(old)}\n${JSON.stringify(future)}\n`);
    const j = journalFile(root);
    j.append({
      v: 1,
      kind: 'reroute',
      at: 3,
      mapId: 'm1',
      rerouteId: 'R-1',
      action: 'proposed',
      actor: 'a',
      actorKind: 'agent',
    });
    fs.appendFileSync(file, '{torn');
    expect(j.read('m1').map((e) => e.event)).toEqual(['claim']);
    expect(j.readAll('m1').map((e) => e.kind)).toEqual(['transition', 'reroute']);
  });
});
