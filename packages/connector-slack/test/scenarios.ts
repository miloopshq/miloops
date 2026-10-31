import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { MemoryAdapter, chartMap, claim, type MapSections } from '@miloops-hq/core';
import { ALL_SCOPES, ANA, EVE, RAJ, TOKENS, agentDoc, connected, readJson, until, type World } from './harness';

const SECTIONS: MapSections = {
  destination: 'A durable event store.',
  notes: '',
  decisions: [],
  unspecified: [],
  outOfScope: [],
};

async function eventStore() {
  const a = new MemoryAdapter({ latency: [0, 0], label: 'GitHub Issues', location: 'octo-org/launchpad' });
  const { map, tickets } = await chartMap(a, {
    title: 'Event store',
    sections: SECTIONS,
    tickets: [
      { ref: 'bench', title: 'Bench write paths', type: 'research', body: 'Measure.' },
      { ref: 'db', title: 'Pick DB', type: 'grilling', body: 'Postgres or SQLite?' },
      { ref: 'retention', title: 'Retention policy', type: 'grilling', body: 'How long?' },
      { ref: 'migrate', title: 'Migrate schema', type: 'execute', body: 'Apply.', blockedBy: ['db'] },
    ],
  });
  const second = await chartMap(a, {
    title: 'Mobile sync',
    sections: SECTIONS,
    tickets: [{ ref: 'conf', title: 'Conflict policy', type: 'grilling', body: 'LWW?' }],
  });
  const [bench, db, retention, migrate] = tickets;
  await claim(a, map.id, db.id, 'claude-07');
  return { a, map, bench, db, retention, migrate, second };
}

/** Steps 1–5 of the guided setup, including the mistakes the panel explains. */
export async function setupFlow(w: World) {
  const svc = w.service(new MemoryAdapter({ latency: [0, 0] }));
  const s0 = svc.status();
  const s1 = svc.markCreated();
  const userToken = await svc.pasteToken(TOKENS.user);
  const app = await svc.pasteToken(TOKENS.app);
  if (w.fake) w.fake.state.scopes = ALL_SCOPES.filter((s) => s !== 'users:read');
  const missingScope = await svc.pasteToken(TOKENS.bot);
  if (w.fake) w.fake.state.scopes = [...ALL_SCOPES];
  const bot = await svc.pasteToken(TOKENS.bot);
  await until(() => svc.status().state === 'online', 'socket online');
  const beforeClaim = svc.status();
  await w.send(svc, 'owner opens the Home tab', (f) => f.payload.homeOpened(ANA));
  await w.send(svc, 'owner clicks This is me', (f) => f.payload.clickHome(ANA, 'claim_owner'));
  await w.send(svc, 'someone else clicks This is me later', (f) => f.payload.clickHome(RAJ, 'claim_owner'));
  const after = svc.status();
  const creds = readJson(path.join(w.configDir, 'credentials.json'));
  const settings = readJson(path.join(w.configDir, 'slack.json'));
  return {
    s0,
    s1,
    userToken,
    app,
    missingScope,
    bot,
    beforeClaim,
    after,
    creds,
    settings,
    socketConnections: w.hub.connections,
  };
}

/** Agent asks reach the owner as DMs; answers from buttons or the reply modal reach the agent; UI answers close the DM. */
export async function askFlow(w: World) {
  const { a, map, db, retention } = await eventStore();
  connected(w, { allow: [RAJ] });
  const svc = w.service(a);
  await until(() => svc.status().state === 'online', 'socket online');
  agentDoc(w.root, {
    sid: 's1',
    mapId: map.id,
    ticketId: db.id,
    pending: [
      {
        id: 'q1',
        ticketId: db.id,
        text: 'Postgres or SQLite for the event store? Postgres needs a container in CI.',
        suggestions: ['Postgres', 'SQLite'],
        at: Date.now(),
      },
    ],
  });
  await svc.tick();
  const asks1 = readJson(path.join(w.root, '.agents', 'slack.json')).asks;
  const dm = asks1.q1.channel as string;
  const ts1 = asks1.q1.ts as string;
  await w.send(svc, 'eve (not allowed) clicks Postgres', (f) => f.payload.click(EVE, dm, ts1, 'ask_option:0'));
  await w.send(svc, 'ana clicks Postgres', (f) => f.payload.click(ANA, dm, ts1, 'ask_option:0'));
  const answerFile = path.join(w.root, '.agents', 'answers', 's1', 'q1.json');
  const answer1 = existsSync(answerFile) ? readJson(answerFile) : undefined;
  await w.send(svc, 'raj clicks SQLite late', (f) => f.payload.click(RAJ, dm, ts1, 'ask_option:1'));
  // The agent's process picks up the answer and stops waiting.
  agentDoc(w.root, {
    sid: 's1',
    mapId: map.id,
    ticketId: db.id,
    chats: [{ id: 'c1', from: 'human', author: 'slack:U0ANA0001', text: 'Postgres', at: Date.now() }],
  });
  await svc.tick();

  // Answered in the command center instead.
  agentDoc(w.root, {
    sid: 's2',
    mapId: map.id,
    ticketId: retention.id,
    agent: 'codex-02',
    pending: [{ id: 'q2', ticketId: retention.id, text: 'Keep events for 30 or 90 days?', at: Date.now() }],
  });
  await svc.tick();
  agentDoc(w.root, {
    sid: 's2',
    mapId: map.id,
    ticketId: retention.id,
    agent: 'codex-02',
    chats: [{ id: 'c2', from: 'human', author: 'operator', text: '90 days', at: Date.now() }],
  });
  await svc.tick();

  // Reply… opens a modal.
  agentDoc(w.root, {
    sid: 's3',
    mapId: map.id,
    agent: 'claude-09',
    pending: [{ id: 'q3', text: 'Name for the events table?', at: Date.now() }],
  });
  await svc.tick();
  const ts3 = readJson(path.join(w.root, '.agents', 'slack.json')).asks.q3.ts as string;
  await w.send(svc, 'ana clicks Reply…', (f) => f.payload.click(ANA, dm, ts3, 'ask_reply'));
  await w.send(svc, 'ana submits an empty reply', (f) =>
    f.payload.submit(ANA, [...f.views.keys()].at(-1)!, { answer: '' }),
  );
  await w.send(svc, 'ana submits the reply', (f) =>
    f.payload.submit(ANA, [...f.views.keys()].at(-1)!, { answer: 'event_log' }),
  );
  const answer3 = readJson(path.join(w.root, '.agents', 'answers', 's3', 'q3.json'));
  agentDoc(w.root, {
    sid: 's3',
    mapId: map.id,
    agent: 'claude-09',
    chats: [{ id: 'c3', from: 'human', author: 'slack:U0ANA0001', text: 'event_log', at: Date.now() }],
  });

  // Agent quits while waiting.
  agentDoc(w.root, { sid: 's4', mapId: map.id, pending: [{ id: 'q4', text: 'Ship behind a flag?', at: Date.now() }] });
  await svc.tick();
  agentDoc(w.root, { sid: 's4', mapId: map.id, status: 'done' });
  await svc.tick();

  await w.send(svc, '/milo inbox with nothing waiting', (f) => f.payload.command(ANA, dm, 'inbox'));
  const asks = readJson(path.join(w.root, '.agents', 'slack.json')).asks;
  return { answer1, answer3, asks, answers: readdirSync(path.join(w.root, '.agents', 'answers')) };
}

/** "Save as decision" on a thread and `/milo decide`: modal, related ticket, record, tracker write-back, confirmation. */
export async function decisionFlow(w: World) {
  const { a, map, db, second } = await eventStore();
  connected(w, { allow: [RAJ] });
  const svc = w.service(a);
  await until(() => svc.status().state === 'online', 'socket online');
  let root = '';
  let reply = '';
  if (w.fake) {
    root = w.fake.human.post('C0INFRA01', ANA, 'Event store: Postgres or SQLite? <@U0RAJ0001> any numbers?');
    w.fake.human.post('C0INFRA01', RAJ, 'Postgres handled 40k writes/s in the bench; SQLite topped at 6k.', root);
    w.fake.human.post('C0INFRA01', ANA, 'CI needs a container for Postgres though.', root);
    reply = w.fake.human.post(
      'C0INFRA01',
      RAJ,
      'Use Postgres; SQLite for tests. See <https://example.com/bench|the bench>.',
      root,
    );
    w.fake.human.post('C0RANDOM1', ANA, 'Lunch?');
  }
  const lastView = (f: { views: Map<string, unknown> }) => [...f.views.keys()].at(-1)!;
  await w.send(svc, 'eve (not allowed) runs Save as decision', (f) => f.payload.shortcut(EVE, 'C0INFRA01', reply));
  await w.send(svc, 'ana runs Save as decision on the last reply', (f) => f.payload.shortcut(ANA, 'C0INFRA01', reply));
  await w.send(svc, 'ana switches the mission', (f) => f.payload.pick(ANA, lastView(f), 'mission_pick', second.map.id));
  await w.send(svc, 'ana switches back', (f) => f.payload.pick(ANA, lastView(f), 'mission_pick', map.id));
  await w.send(svc, 'ana saves with the decision emptied', (f) => f.payload.submit(ANA, lastView(f), { decision: '' }));
  await w.send(svc, 'ana saves', (f) => f.payload.submit(ANA, lastView(f)));
  const snap = await a.loadMap(map.id);
  const records = await a.listDecisions(map.id);

  await w.send(svc, 'raj runs Save as decision where MILO is not invited', (f) =>
    f.payload.shortcut(RAJ, 'C0RANDOM1', f.channels.get('C0RANDOM1')!.messages[0].ts),
  );
  await w.send(svc, 'raj runs /milo decide in #milo-test', (f) =>
    f.payload.command(RAJ, 'G0MILOTST', 'decide SQLite for tests, Postgres in CI'),
  );
  await w.send(svc, 'raj saves it as mission only', (f) => f.payload.submit(RAJ, lastView(f), { mode: 'mission' }));
  const after = await a.loadMap(map.id);
  const all = await a.listDecisions(map.id);
  return { snap, records, after, all, dbId: db.id, mapId: map.id };
}

/** `/milo status`, `/milo help`, and refusals. */
export async function statusFlow(w: World) {
  const { a, map, db } = await eventStore();
  connected(w);
  const svc = w.service(a);
  await until(() => svc.status().state === 'online', 'socket online');
  agentDoc(w.root, {
    sid: 's1',
    mapId: map.id,
    ticketId: db.id,
    pending: [{ id: 'q1', ticketId: db.id, text: 'Postgres or SQLite?', at: Date.now() - 12 * 60_000 }],
  });
  const help = await w.send(svc, '/milo help', (f) => f.payload.command(ANA, 'C0INFRA01', 'help'));
  const refused = await w.send(svc, 'eve runs /milo status', (f) => f.payload.command(EVE, 'C0INFRA01', 'status'));
  await w.send(svc, '/milo status', (f) => f.payload.command(ANA, 'C0INFRA01', 'status'));
  await w.send(svc, '/milo status event', (f) => f.payload.command(ANA, 'C0INFRA01', 'status event'));
  await w.send(svc, '/milo status nope', (f) => f.payload.command(ANA, 'C0INFRA01', 'status nope'));
  await w.send(svc, '/milo inbox', (f) => f.payload.command(ANA, 'C0INFRA01', 'inbox'));
  const unknown = await w.send(svc, '/milo dance', (f) => f.payload.command(ANA, 'C0INFRA01', 'dance'));
  return { help, refused, unknown };
}

/** Notifications: blocked and mission done, one message per mission per window, threaded under the day's first. */
export async function notifyFlow(w: World) {
  const { a, map, bench, db, retention, migrate } = await eventStore();
  connected(w, {
    notify: { target: 'dm', events: ['awaiting', 'blocked', 'mission.done', 'resolved'], detail: 'full' },
  });
  const svc = w.service(a);
  await until(() => svc.status().state === 'online', 'socket online');
  await svc.tick(); // baseline: nothing is sent for the state MILO found
  await a.addBlocking(map.id, retention.id, bench.id);
  await svc.tick();
  for (const t of [bench, db, retention, migrate]) await a.close(map.id, t.id, 'completed');
  await svc.tick();
  await svc.tick();
}
