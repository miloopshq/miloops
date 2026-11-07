/**
 * The Slack fake over real HTTP and WebSocket, for driving the Lookout in a browser:
 *
 *   node test/run.mjs serve 7499
 *   TEAMTRAIL_SLACK_API=http://localhost:7499/api npm run dev
 *
 * Paste `fake.tokens.app` / `fake.tokens.bot` (printed on start) into Settings → Slack. User
 * actions in "Slack" are simulated with `POST /control/<payload builder>` and a JSON array of
 * arguments, e.g. `curl -XPOST localhost:7499/control/clickHome -d '["U0ANA0001","claim_owner"]'`.
 * `GET /control/messages?channel=D0ANA0001` lists what Scout posted.
 */
import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { fakeSlack } from './fakes/slack';

const port = Number(process.argv[2] ?? 7499);
const origin = `http://localhost:${port}`;
const fake = fakeSlack({ start: Date.now() });
const sockets = new Set<WebSocket>();
const acks = new Map<string, (payload: unknown) => void>();
let seq = 0;

const read = (req: http.IncomingMessage) =>
  new Promise<string>((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', origin);
  const body = await read(req);
  if (url.pathname.startsWith('/api/')) {
    const r = await fake.fetch(`https://slack.com${url.pathname}${url.search}`, {
      method: req.method,
      headers: { authorization: req.headers.authorization ?? '' },
      body: body || undefined,
    });
    let text = await r.text();
    if (url.pathname === '/api/apps.connections.open')
      text = text.replace('wss://wss-primary.slack.test', `ws://localhost:${port}`);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(text);
    return;
  }
  if (url.pathname.startsWith('/hooks/')) {
    fake.responses.push({ url: url.pathname, body: JSON.parse(body || '{}') });
    return json(res, 200, { ok: true });
  }
  if (url.pathname === '/control/messages') {
    const c = fake.channels.get(url.searchParams.get('channel') ?? '');
    return json(res, c ? 200 : 404, c ? c.messages : { error: 'channel_not_found' });
  }
  if (url.pathname === '/control/responses') return json(res, 200, fake.responses);
  if (url.pathname === '/control/state' && req.method === 'POST') {
    Object.assign(fake.state, JSON.parse(body || '{}'));
    return json(res, 200, fake.state);
  }
  if (url.pathname === '/control/post' && req.method === 'POST') {
    const [channel, user, text, thread] = JSON.parse(body) as string[];
    return json(res, 200, { ts: fake.human.post(channel, user, text, thread) });
  }
  const builder = url.pathname.match(/^\/control\/(\w+)$/)?.[1] as keyof typeof fake.payload | undefined;
  if (builder && builder in fake.payload && req.method === 'POST') {
    const ws = [...sockets].at(-1);
    if (!ws) return json(res, 409, { error: 'Scout is not connected over Socket Mode' });
    const build = fake.payload[builder] as (...a: unknown[]) => { type: string; payload: Record<string, unknown> };
    const e = build(...(JSON.parse(body || '[]') as unknown[]));
    const raw = JSON.stringify(e.payload).replaceAll('https://hooks.slack.test', `${origin}/hooks`);
    const envelope_id = `env-${++seq}`;
    const ack = new Promise((r) => acks.set(envelope_id, r));
    ws.send(
      JSON.stringify({
        envelope_id,
        type: e.type,
        payload: JSON.parse(raw),
        accepts_response_payload: e.type !== 'events_api',
      }),
    );
    return json(res, 200, { ack: (await ack) ?? null });
  }
  json(res, 404, { error: 'not_found' });
});

new WebSocketServer({ server }).on('connection', (ws) => {
  sockets.add(ws);
  ws.on('close', () => sockets.delete(ws));
  ws.on('message', (data) => {
    const m = JSON.parse(String(data)) as { envelope_id: string; payload?: unknown };
    acks.get(m.envelope_id)?.(m.payload);
    acks.delete(m.envelope_id);
  });
  ws.send(JSON.stringify({ type: 'hello', num_connections: sockets.size, connection_info: { app_id: fake.app.id } }));
});

server.listen(port, () => {
  process.stdout.write(
    `fake Slack on ${origin}\n  TEAMTRAIL_SLACK_API=${origin}/api\n  app token  ${fake.tokens.app}\n  bot token  ${fake.tokens.bot}\n`,
  );
});
