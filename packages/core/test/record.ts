/**
 * Re-records the fixtures:  node packages/core/test/run.mjs record [fake|live]
 *   fake  flow fixtures against test/fakes (deterministic; no network)
 *   live  read-only calls against api.github.com (token from GITHUB_TOKEN or `gh auth token`; repo MILOOPS_LIVE_REPO,
 *         default miloopshq/miloops) and Linear's auth error. Tokens are never written: only method, path and body are kept.
 */
import { execFileSync } from 'node:child_process';
import { GitHubAdapter, testGitHub } from '../src/adapters/remote/github';
import { LinearAdapter, testLinear } from '../src/adapters/remote/linear';
import { fakeGitHub } from './fakes/github';
import { fakeLinear } from './fakes/linear';
import { faulty, recorder, type Exchange } from './fixtures';
import {
  FROZEN,
  freezeTime,
  missionFlow,
  noSleep,
  offlineFlow,
  lateMissionFlow,
  rateLimitFlow,
  syncFlow,
} from './scenarios';

const NOTE_FAKE =
  'Recorded against test/fakes; request and response shapes follow the live API (see *-live-* fixtures and the introspected schema).';

async function recordFake() {
  const thaw = freezeTime();
  try {
    {
      const fake = fakeGitHub();
      const rec = recorder(fake.fetch);
      await missionFlow(
        () => new GitHubAdapter({ repo: fake.repo, token: 'x', fetch: rec.fetch, manual: true, ...noSleep }),
      );
      rec.save('github-flow.json', 'fake', NOTE_FAKE);
    }
    {
      const fake = fakeGitHub();
      const rec = recorder(fake.fetch);
      await syncFlow(
        () => new GitHubAdapter({ repo: fake.repo, token: 'x', fetch: rec.fetch, manual: true, ...noSleep }),
        {
          act(id) {
            fake.human.comment(Number(id), 'mona', 'Closing: Yjs it is.');
            fake.human.close(Number(id));
          },
        },
      );
      rec.save(
        'github-sync.json',
        'fake',
        `${NOTE_FAKE} Between polls, user "mona" comments on and closes the ticket in GitHub.`,
      );
    }
    {
      const fake = fakeGitHub();
      const rec = recorder(fake.fetch);
      await lateMissionFlow(
        () => new GitHubAdapter({ repo: fake.repo, token: 'x', fetch: rec.fetch, manual: true, ...noSleep }),
      );
      rec.save(
        'github-late-mission.json',
        'fake',
        `${NOTE_FAKE} A second adapter (another process) charts a mission between the first list and the first poll.`,
      );
    }
    {
      const fake = fakeGitHub();
      const net = faulty(fake.fetch);
      const rec = recorder(net.fetch);
      await offlineFlow(
        () => new GitHubAdapter({ repo: fake.repo, token: 'x', fetch: rec.fetch, manual: true, ...noSleep }),
        { offline: (on) => (net.state.fault = on ? 'offline' : undefined) },
      );
      rec.save('github-offline.json', 'fake', `${NOTE_FAKE} status 0 = network failure.`);
    }
    {
      const fake = fakeGitHub();
      const net = faulty(fake.fetch);
      const rec = recorder(net.fetch);
      const reset = String(Math.floor(FROZEN / 1000) + 1800);
      await rateLimitFlow(
        () => new GitHubAdapter({ repo: fake.repo, token: 'x', fetch: rec.fetch, manual: true, ...noSleep }),
        {
          limit(kind) {
            let once = true;
            net.state.fault =
              kind === 'short'
                ? () =>
                    once
                      ? ((once = false),
                        new Response(JSON.stringify({ message: 'You have exceeded a secondary rate limit.' }), {
                          status: 429,
                          headers: { 'retry-after': '1' },
                        }))
                      : undefined
                : kind === 'long'
                  ? () =>
                      new Response(JSON.stringify({ message: 'API rate limit exceeded for user ID 4242.' }), {
                        status: 403,
                        headers: {
                          'x-ratelimit-limit': '5000',
                          'x-ratelimit-remaining': '0',
                          'x-ratelimit-reset': reset,
                        },
                      })
                  : undefined;
          },
        },
      );
      rec.save(
        'github-ratelimit.json',
        'fake',
        `${NOTE_FAKE} Error bodies and headers as documented for secondary (429 + retry-after) and primary (403 + x-ratelimit-remaining: 0) limits.`,
      );
    }
    {
      const fake = fakeLinear();
      const rec = recorder(fake.fetch);
      await missionFlow(
        () =>
          new LinearAdapter({ apiKey: 'lin_api_x', teamId: fake.team.id, fetch: rec.fetch, manual: true, ...noSleep }),
      );
      rec.save('linear-flow.json', 'fake', NOTE_FAKE);
    }
    {
      const fake = fakeLinear();
      const rec = recorder(fake.fetch);
      await syncFlow(
        () =>
          new LinearAdapter({ apiKey: 'lin_api_x', teamId: fake.team.id, fetch: rec.fetch, manual: true, ...noSleep }),
        {
          act(id) {
            fake.human.comment(id, 'Grace', 'Closing: Yjs it is.');
            fake.human.complete(id);
          },
        },
      );
      rec.save(
        'linear-sync.json',
        'fake',
        `${NOTE_FAKE} Between polls, "Grace" comments on and completes the ticket in Linear.`,
      );
    }
    {
      const fake = fakeLinear();
      const rec = recorder(fake.fetch);
      await lateMissionFlow(
        () =>
          new LinearAdapter({ apiKey: 'lin_api_x', teamId: fake.team.id, fetch: rec.fetch, manual: true, ...noSleep }),
      );
      rec.save(
        'linear-late-mission.json',
        'fake',
        `${NOTE_FAKE} A second adapter (another process) charts a mission between the first list and the first poll.`,
      );
    }
  } finally {
    thaw();
  }
}

/** Keep only what the adapter reads, so live recordings carry no unrelated repo data. */
function trimLive(req: Exchange['req'], body: unknown): unknown {
  if (Array.isArray(body))
    return body.map((i: Record<string, unknown>) => ({
      number: i.number,
      title: i.title,
      labels: ((i.labels as { name: string }[]) ?? []).map((l) => ({ name: l.name })),
      updated_at: i.updated_at,
      ...(i.pull_request ? { pull_request: {} } : {}),
    }));
  if (body && typeof body === 'object' && /^\/repos\/[^/]+\/[^/?]+$/.test(req.url)) {
    const r = body as Record<string, unknown>;
    return { full_name: r.full_name, private: r.private, has_issues: r.has_issues, permissions: r.permissions };
  }
  return body;
}

async function recordLive() {
  const token = process.env.GITHUB_TOKEN || execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  const repo = process.env.MILOOPS_LIVE_REPO || 'miloopshq/miloops';
  const rec = recorder(fetch, trimLive);
  const test = await testGitHub({ repo, token, fetch: rec.fetch });
  const a = new GitHubAdapter({ repo, token, fetch: rec.fetch, manual: true });
  const maps = await a.listMaps();
  a.subscribe(() => {});
  await a.tick();
  await a.tick();
  rec.save(
    'github-live-read.json',
    'live',
    `Read-only, ${repo} on api.github.com: test connection, list missions, two ETag polls (200 then 304). Bodies trimmed to the fields the adapter reads.`,
  );
  console.log('github live:', JSON.stringify({ test, maps, status: a.status }));

  const lrec = recorder(fetch);
  const l = await testLinear({ apiKey: 'lin_api_invalid_key_for_recording', fetch: lrec.fetch });
  lrec.save(
    'linear-live-auth.json',
    'live',
    'api.linear.app with an invalid personal API key (no Linear key was available for a full live run).',
  );
  console.log('linear live:', JSON.stringify(l));
}

const mode = process.argv[2] ?? 'fake';
await (mode === 'live' ? recordLive() : recordFake());
console.log(`recorded ${mode} fixtures`);
