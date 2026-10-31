// End-to-end check of the MCP server against the built CLI: a stdio MCP client drives a mission while the
// command center (in Chrome) shows it live, and every HITL question is answered in the command center inbox.
// Usage: npm run build -w miloops && node scripts/verify-mcp.mjs [screenshotDir]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '../packages/cli/dist/cli.js');
const shots = process.argv[2];
if (!fs.existsSync(cli)) throw new Error('build the CLI first: npm run build -w miloops');
if (shots) fs.mkdirSync(shots, { recursive: true });

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'miloops-e2e-'));
const log = (...a) => console.log('·', ...a);

// 1. The command center, as the user starts it.
const server = spawn(process.execPath, [cli, '--no-open', '--port', '0'], { cwd: repo });
const url = await new Promise((resolve, reject) => {
  let out = '';
  server.stdout.on('data', (c) => {
    out += c;
    const m = out.match(/Command center\s+(http:\S+)/);
    if (m) resolve(m[1]);
  });
  server.on('exit', (code) => reject(new Error(`miloops exited ${code}: ${out}`)));
});
log('command center', url);

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/local/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.locator('.dialog.onboarding').waitFor();
await page.getByRole('button', { name: 'Get started' }).click();
const shot = async (name) => {
  await page.waitForTimeout(700);
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) });
};

// 2. The agent, as Claude Code starts it (`claude mcp add miloops -- npx miloops mcp`): Claude Code passes
// CLAUDE_PROJECT_DIR and tags each call with its tool_use id; the transcript holds the API usage of every message.
const claudeConfig = path.join(repo, '.claude-config');
const transcript = path.join(claudeConfig, 'projects', repo.replace(/[^a-zA-Z0-9]/g, '-'), 'verify-session.jsonl');
fs.mkdirSync(path.dirname(transcript), { recursive: true });
const PER_MESSAGE = { input_tokens: 200, cache_creation_input_tokens: 300, cache_read_input_tokens: 1500, output_tokens: 150 };
const PER_MESSAGE_USD = (200 * 3 + 300 * 3.75 + 1500 * 0.3 + 150 * 15) / 1e6;
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [cli, 'mcp'],
  cwd: repo,
  stderr: 'pipe',
  env: { ...process.env, CLAUDE_CONFIG_DIR: claudeConfig, CLAUDE_PROJECT_DIR: repo },
});
const client = new Client({ name: 'claude-code', version: '2.1.0' });
await client.connect(transport);
const tools = (await client.listTools()).tools.map((t) => t.name);
log(`MCP connected · ${tools.length} tools: ${tools.join(', ')}`);
let seq = 0;
const call = async (name, args = {}) => {
  const id = `toolu_verify_${Date.now().toString(36)}_${seq++}`;
  const message = { id: `msg_verify_${seq}`, type: 'message', role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'tool_use', id, name: `mcp__miloops__${name}`, input: args }], usage: PER_MESSAGE };
  fs.appendFileSync(transcript, `${JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), requestId: `req_${seq}`, message })}\n`);
  const r = await client.callTool({ name, arguments: args, _meta: { 'claudecode/toolUseId': id } }, undefined, { timeout: 120_000 });
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  return JSON.parse(r.content[0].text);
};

/** Answer the open question in the command center inbox, by suggestion chip or by typing. */
async function answerInUi(text, { chip = false } = {}) {
  await page.locator('.inbox-list li button').first().waitFor({ timeout: 15_000 });
  await page.locator('.inbox-list li button').first().click();
  if (chip) await page.locator('.suggest .chip', { hasText: text }).click();
  else {
    await page.locator('.comms-input textarea').fill(text);
    await page.locator('.comms-input textarea').press('Enter');
  }
}

// /milo new: framing question, answered in the command center.
const framing = call('ask_human', { question: 'Who is the changelog page for?', suggestions: ['Users of the CLI', 'Contributors'], framing: true });
await page.locator('.inbox-list li').first().waitFor({ timeout: 15_000 });
await shot('01-framing-question-in-inbox');
await answerInUi('Users of the CLI', { chip: true });
const f = await framing;
log(`framing answered in UI: "${f.answer}" by ${f.answeredBy}`);

const started = await call('start_mission', {
  title: 'Changelog page',
  destination: 'A public changelog page generated from release notes',
  decided: ['Static page, no backend'],
  unspecified: ['RSS feed'],
  outOfScope: ['Email digests'],
  tickets: [
    { ref: 'src', title: 'Where do release notes live today?', type: 'research' },
    { ref: 'layout', title: 'Timeline or grouped by version?', type: 'grilling', blockedBy: ['src'] },
    { ref: 'host', title: 'Where is it hosted?', type: 'research' },
    { ref: 'build', title: 'Build the changelog page', type: 'execute', blockedBy: ['layout', 'host'] },
  ],
});
log(`mission ${started.mission.key} "${started.mission.title}" · ${started.tickets.length} tickets`);
await page.locator('.node').nth(3).waitFor({ timeout: 15_000 });
await shot('02-mission-charted-by-agent');

// /milo resume: claim, report, close.
await call('resume_mission');
const c1 = await call('claim_ticket');
log(`claimed ${c1.claimed.key} (${c1.claimed.attention})`);
await call('report_progress', { step: 'Investigate', message: 'reading apps/command-center/src/changelog.ts', inputTokens: 18_400, outputTokens: 2_100, costUsd: 0.087 });
const d1 = await call('close_ticket', {
  resolution: 'Release notes live in the in-app changelog module (RELEASES). Generate the page from it.',
  rationale: 'One source for the app and the page',
  alternatives: ['GitHub releases', 'A separate CHANGELOG.md'],
});
log(`closed ${d1.closed} · ${d1.decision.id} · unblocked ${d1.unblocked.map((t) => t.key).join(', ')}`);

const c2 = await call('claim_ticket');
log(`claimed ${c2.claimed.key} (${c2.claimed.attention})`);
await call('report_progress', { say: 'The notes are grouped by release already. One question before I decide the layout.', inputTokens: 6_200, outputTokens: 900, costUsd: 0.032 });
const hitl = call('ask_human', { question: 'Timeline, or grouped by version with the newest first?', suggestions: ['Grouped by version', 'Timeline'] });
await page.locator('.inbox-list li').first().waitFor({ timeout: 15_000 });
await page.locator('.inbox-list li button').first().click();
await shot('03-agent-question-waiting-on-you');
await answerInUi('Grouped by version, newest first');
const h = await hitl;
log(`HITL answered in UI: "${h.answer}" after ${h.waitedSeconds}s`);
const d2 = await call('close_ticket', { resolution: 'Group entries by version, newest first, one section per release.', postTranscript: true });
log(`closed ${d2.closed} · ${d2.decision.id} decided by ${d2.decision.decidedBy}`);
await call('record_decision', { question: 'Link it from the landing page?', answer: 'Yes, in the footer next to GitHub.', rationale: 'Low cost, easy to find' });

const c3 = await call('claim_ticket');
await call('report_progress', { step: 'Investigate', message: 'checking the landing deploy', inputTokens: 9_000, outputTokens: 800, costUsd: 0.04 });
log(`claimed ${c3.claimed.key}; left running so the sessions zone shows a live session`);

const status = await call('status');
log(`status: ${status.mission.progress} · ready ${status.mission.ready.map((t) => t.key).join(', ') || '—'} · spend $${status.mission.spend.costUsd} (${status.mission.spend.inputTokens + status.mission.spend.outputTokens} tokens) from ${status.mission.spend.sources.join(', ')}`);
// Every transcript message counts (the status call's own too) except record_decision's: it ran between tickets,
// with no session open. The numbers passed to report_progress are ignored.
const measured = seq - 1;
const spendOk = status.mission.spend.sources.join() === 'claude-code' && Math.abs(status.mission.spend.costUsd - Math.round(measured * PER_MESSAGE_USD * 1e4) / 1e4) < 1e-4;
log(`measured spend ${spendOk ? 'matches' : 'DOES NOT match'} ${measured} transcript messages ($${(measured * PER_MESSAGE_USD).toFixed(6)})`);
const uiTokens = `${((measured * 2150) / 1000).toFixed(1)}k tok`;
await page.locator('.sessions-head .usage', { hasText: uiTokens }).first().waitFor({ timeout: 15000 }).catch(() => {});
await shot('04-live-session-and-decisions');

const ui = {
  decided: await page.locator('.node.st-decided, .node.decided').count(),
  sessions: await page.locator('.sessions-list li:not(.claim)').count(),
  usage: (await page.locator('.sessions-head .usage').first().textContent())?.trim(),
};
log(`command center shows: ${ui.sessions} live session(s), mission usage "${ui.usage}"`);

await client.close();
await page.waitForTimeout(1500);
const after = await page.locator('.sessions-list li:not(.claim)').count();
log(`after the agent disconnected: ${after} live session(s), ${await page.locator('.sessions-list li.claim').count()} claim kept for resume`);
log(`page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
await browser.close();
server.kill('SIGTERM');
if (!process.env.KEEP) fs.rmSync(repo, { recursive: true, force: true }); else log("kept", repo);
if (errors.length || !spendOk || !ui.usage?.includes(uiTokens) || !/LOG$/.test(ui.usage) || f.answer !== 'Users of the CLI' || h.answer !== 'Grouped by version, newest first' || status.mission.progress !== '2/4 decided' || after !== 0) process.exit(1);
console.log('\nOK');
