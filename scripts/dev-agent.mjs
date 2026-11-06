// Real agents for local development: each one is an MCP client of the built CLI (`miloops mcp`), exactly as
// Claude Code or Codex connect, working the seeded missions in ./<dataDir>. They claim ready tickets, report
// progress with token usage, close agent-only work with a resolution, and ask you (with suggested replies) on
// tickets that need a human, waiting for your answer in the command center. Grilling questions are urgent
// (blocking), prototype reviews can wait (soon), and the first one comes with a side question (fyi) the agent doesn't
// wait for, so the ranked queue has something to rank and batch. Nothing is simulated.
// Usage: npm run build -w teamtrail   (once, and after CLI changes)
//        npm run dev                (seeds and starts the command center)
//        npm run dev:agent [agents=2] [mission=#1]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repo, 'packages/cli/dist/cli.js');
if (!fs.existsSync(cli)) throw new Error('build the CLI first: npm run build -w teamtrail');
const count = Number(process.argv[2] ?? 2);
const mission = process.argv[3] ?? '#1';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** What an agent says and suggests on a ticket that needs a human, by ticket type. */
const ASK = {
  grilling: (t) => ({
    say: `Grilling ${t.key}: I need your call before I can record a decision.`,
    question: t.title.endsWith('?') ? t.title : `${t.title}: what outcome would make this a clear yes for you?`,
    // A grilling call stops the agent: nothing useful to do on the ticket until the human answers.
    urgency: 'blocking',
    suggestions: [
      'Users never lose an edit',
      'Fewer than 1% of syncs need manual review',
      'No extra taps in the common case',
    ],
  }),
  prototype: (t) => ({
    say: `Prototype for ${t.key} is ready to look at.`,
    question: `Is the prototype for "${t.title}" good enough to build on?`,
    urgency: 'soon',
    suggestions: ['Good enough, build on it', 'Try the other approach first'],
  }),
};
const askFor = (t) => (ASK[t.type] ?? ASK.grilling)(t);

async function agent(n) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, 'mcp'],
    // Same folder as the seed and the dev server: <dataDir> at the repo root, or $MILOOPS_DIR.
    cwd: repo,
    env: { ...process.env },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'claude-code', version: `dev-agent-${n}` });
  await client.connect(transport);
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 15 * 60_000 });
    if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
    return JSON.parse(r.content[0].text);
  };
  const log = (...a) => console.log(`agent ${n} ·`, ...a);
  /** Progress with usage, like a client that knows its tokens; cost at $3 / $15 per million in / out. */
  const report = (args) =>
    call('report_progress', {
      ...args,
      ...(args.inputTokens ? { costUsd: (args.inputTokens * 3 + (args.outputTokens ?? 0) * 15) / 1e6 } : {}),
    });
  await call('resume_mission', { mission });
  let askedFyi = false;
  for (;;) {
    let claimed;
    try {
      claimed = (await call('claim_ticket', { mission })).claimed;
    } catch (e) {
      log(`nothing to claim (${e.message.split('\n')[0]}); waiting`);
      await pause(10_000);
      continue;
    }
    log(`claimed ${claimed.key} ${claimed.title} (${claimed.attention})`);
    await report({ step: 'Claim', message: claimed.title, inputTokens: 9_000, outputTokens: 700 });
    await pause(2500 + n * 900);
    if (claimed.attention === 'hitl') {
      const q = askFor(claimed);
      await report({ step: 'Resolve', say: q.say, inputTokens: 4_000, outputTokens: 400 });
      if (!askedFyi) {
        // A side question the agent doesn't wait for: it ranks low and batches with the urgent one below.
        askedFyi = true;
        await call('ask_human', {
          question: `While on ${claimed.key}: should merge summaries name who made each edit?`,
          suggestions: ['Yes, show names', 'No, keep it anonymous'],
          urgency: 'fyi',
          waitSeconds: 0,
        });
      }
      log(`asking: ${q.question}`);
      const a = await call('ask_human', {
        question: q.question,
        suggestions: q.suggestions,
        urgency: q.urgency,
        blocks: [claimed.key],
        waitSeconds: 3600,
      });
      if (!a.answered) {
        log('no answer within the hour; releasing the ticket');
        await call('release_ticket', { mission, reason: 'No answer yet' });
        continue;
      }
      log(`answered: ${a.answer}`);
      await report({
        step: 'Record',
        message: 'recording the decision',
        inputTokens: 3_000,
        outputTokens: 500,
      });
      await call('close_ticket', {
        mission,
        resolution: `Decided with the operator: ${a.answer}.`,
        rationale: 'The operator made the call in the command center.',
        alternatives: q.suggestions.filter((x) => x !== a.answer),
      });
    } else {
      await report({
        step: claimed.type === 'research' ? 'Investigate' : 'Resolve',
        message: 'reading the codebase and docs',
        inputTokens: 22_000,
        outputTokens: 2_400,
      });
      await pause(6000 + n * 1500);
      await report({
        step: 'Record',
        message: 'writing up findings',
        inputTokens: 6_000,
        outputTokens: 1_800,
      });
      await call('close_ticket', {
        mission,
        resolution: `Findings for "${claimed.title}" recorded on the ticket.`,
        noCodeReason: 'Investigation only; no code change.',
      });
    }
    log(`closed ${claimed.key}`);
    await pause(3000);
  }
}

console.log(
  `${count} agent(s) on ${mission} in ${path.join(repo, '.miloops')}. Answer their questions in the command center. Ctrl+C to stop.`,
);
await Promise.all(
  Array.from({ length: count }, (_, i) =>
    agent(i + 1).catch((e) => console.error(`agent ${i + 1} stopped:`, e.message)),
  ),
);
