/**
 * Serves the fake GitHub and Linear APIs over HTTP for browser runs of the
 * command center:  node packages/core/test/run.mjs serve [port]
 * Point the CLI at it with MILOOPS_GITHUB_API=http://127.0.0.1:<port> and
 * MILOOPS_LINEAR_API=http://127.0.0.1:<port>/linear. Admin routes act as a
 * teammate in the tracker or cut the network:
 *   POST /__fake/github/close?n=<issue>   POST /__fake/github/comment?n=<issue>&user=<login>&body=<text>
 *   POST /__fake/offline?on=1|0
 */
import http from 'node:http';
import { fakeGitHub } from './fakes/github';
import { fakeLinear } from './fakes/linear';

const port = Number(process.argv[2] ?? 7471);
const gh = fakeGitHub({ repo: 'octo-org/launchpad', start: Date.now() - 3_600_000 });
const ln = fakeLinear({ start: Date.now() - 3_600_000 });
let offline = false;

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    if (url.pathname.startsWith('/__fake/')) {
      const q = url.searchParams;
      if (url.pathname === '/__fake/offline') offline = q.get('on') === '1';
      else if (url.pathname === '/__fake/github/close') gh.human.close(Number(q.get('n')), (q.get('reason') as 'completed') ?? 'completed');
      else if (url.pathname === '/__fake/github/comment') gh.human.comment(Number(q.get('n')), q.get('user') ?? 'mona', q.get('body') ?? '');
      res.end(JSON.stringify({ ok: true, offline }));
      return;
    }
    if (offline) return void req.socket.destroy();
    const init = { method: req.method, headers: req.headers as Record<string, string>, body: text || undefined };
    const r = url.pathname.startsWith('/linear') ? await ln.fetch(url.toString(), init) : await gh.fetch(url.toString(), init);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
  })
  .listen(port, '127.0.0.1', () => console.log(`fake GitHub + Linear on http://127.0.0.1:${port}`));
