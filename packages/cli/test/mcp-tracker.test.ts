import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MarkdownAdapter } from '@miloops-hq/core';
import { activeTracker } from '@miloops-hq/core/bridge';
import { nodeMarkdownFs } from '@miloops-hq/core/node';
import { readAgentDocs } from '@miloops-hq/core/agents';
import { fakeGitHub } from '../../core/test/fakes/github';
import { MissionAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';

let root: string;
let configDir: string;
const open: { close(): void | Promise<void> }[] = [];
const noGh = async () => {
  throw new Error('gh: not installed');
};

/** An MCP agent on the project's active tracker, the way `miloops mcp` builds it. */
async function connect(env: Record<string, string | undefined>, fetch: typeof globalThis.fetch) {
  const markdown = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const tracker = activeTracker({ root, markdown, env, exec: noGh, fetch, configDir });
  const agent = new MissionAgent({ root, agent: 'claude-01', pollMs: 20, tracker });
  const server = createMcpServer(agent, '0.0.0-test');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'claude-code', version: '1.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  open.push({ close: () => agent.close() }, client);
  return async <T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0].text);
    return JSON.parse(r.content[0].text) as T;
  };
}

const useGitHub = () => fs.writeFileSync(path.join(root, 'trackers.json'), JSON.stringify({ active: 'github', github: { repo: 'octo-org/launchpad' } }));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'miloops-mcp-gh-'));
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miloops-config-'));
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(configDir, { recursive: true, force: true });
});

describe('MCP agent on the active tracker', () => {
  it('charts, claims and closes tickets as GitHub issues when GitHub is connected', async () => {
    useGitHub();
    const gh = fakeGitHub();
    const call = await connect({ GITHUB_TOKEN: 'gho_test' }, gh.fetch);

    const started = await call<{ mission: { id: string; key: string }; tickets: { ref: string; key: string }[] }>('start_mission', {
      title: 'Changelog page',
      destination: 'A public changelog page generated from releases',
      tickets: [
        { ref: 'src', title: 'Where do release notes live?', type: 'research' },
        { ref: 'build', title: 'Build the page', type: 'task', blockedBy: ['src'] },
      ],
    });
    const key = (ref: string) => started.tickets.find((t) => t.ref === ref)!.key;
    const issue = (k: string) => gh.issues.get(Number(k.replace('#', '')))!;
    const mission = gh.issues.get(Number(started.mission.id))!;
    expect(mission.labels).toContain('miloops:map');
    expect(mission.subIssues).toEqual([issue(key('src')).number, issue(key('build')).number]);
    expect(issue(key('build')).blockedBy).toEqual([issue(key('src')).id]);

    const claimed = await call<{ claimed: { key: string; assignee: string } }>('claim_ticket');
    expect(claimed.claimed).toMatchObject({ key: key('src'), assignee: 'claude-01' });
    expect(issue(key('src')).body).toContain('"assignee":"claude-01"');
    expect((await readAgentDocs(root)).find((d) => d.session.status === 'running')?.session.ticketId).toBe(String(issue(key('src')).number));

    const closed = await call<{ decision: { id: string }; unblocked: { key: string }[] }>('close_ticket', {
      resolution: 'Release notes live in the in-app changelog module. Reuse it.',
      rationale: 'Single source',
    });
    expect(closed.unblocked.map((t) => t.key)).toEqual([key('build')]);
    const src = issue(key('src'));
    expect(src.state).toBe('closed');
    expect(src.comments.some((c) => c.body.includes('<!-- miloops:decision'))).toBe(true);

    const status = await call<{ mission: { progress: string; ready: { key: string }[] } }>('status');
    expect(status.mission).toMatchObject({ progress: '1/2 decided', ready: [{ key: key('build') }] });
    expect(await new MarkdownAdapter(nodeMarkdownFs(root)).listMaps()).toEqual([]);
  });

  it('fails the call instead of writing to local markdown when the GitHub token is missing', async () => {
    useGitHub();
    const call = await connect({}, fakeGitHub().fetch);
    await expect(call('start_mission', { title: 'M', destination: 'D' })).rejects.toThrow(/No GitHub token/);
    expect(await new MarkdownAdapter(nodeMarkdownFs(root)).listMaps()).toEqual([]);
  });

  it('follows a tracker switch made in Settings without restarting', async () => {
    const gh = fakeGitHub();
    const call = await connect({ GITHUB_TOKEN: 'gho_test' }, gh.fetch);
    await call('start_mission', { title: 'Local one', destination: 'D' });
    expect((await new MarkdownAdapter(nodeMarkdownFs(root)).listMaps()).map((m) => m.title)).toEqual(['Local one']);
    useGitHub();
    await call('start_mission', { title: 'On GitHub', destination: 'D' });
    expect([...gh.issues.values()].map((i) => i.title)).toEqual(['On GitHub']);
  });
});
