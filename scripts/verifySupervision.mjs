// M4 steps of the end-to-end check (verify-mcp.mjs), run on the discovery mission after its brief is accepted, so
// the brief's assumption is already the mission's S-1. Asserts on what the user sees in the command center.
import fs from 'node:fs';
import path from 'node:path';

const refused = (p) =>
  p.then(
    () => '',
    (e) => e.message,
  );

/** Two questions from one agent, one fyi and one blocking: the blocking one ranks first in the queue. */
async function rankedQuestions({ call, page }) {
  await call('ask_human', { question: 'FYI: should search match release dates too?', urgency: 'fyi', waitSeconds: 0 });
  await call('ask_human', {
    question: 'Should search run on every keystroke?',
    suggestions: ['Yes', 'Only on Enter'],
    urgency: 'blocking',
    waitSeconds: 0,
  });
  const rows = page.locator('.attention-queue li.att-item.k-question');
  await rows.nth(1).waitFor({ timeout: 20_000 });
  const first = (await rows.first().getAttribute('class')) ?? '';
  const text = (await rows.first().textContent()) ?? '';
  return first.includes('u-blocking') && /every keystroke/.test(text);
}

/** An agent tries to decide a schema change itself: refused, with "ask" in the reason. */
async function riskyDecision({ call }) {
  const msg = await refused(
    call('record_decision', {
      question: 'Drop the old releases table?',
      answer: 'Yes, drop it in a migration.',
      rationale: 'Nothing reads it any more.',
      category: 'data-deletion',
    }),
  );
  return { ok: /ask/i.test(msg) && /high/i.test(msg), msg };
}

/**
 * Challenge S-1, propose a replan that cancels one ticket and adds two, find the cancelled ticket frozen, approve in
 * the command center, see the new tickets on the map and the replan steps in the journal, and claim a new ticket.
 */
async function replanFlow({ call, page, shot, repo, mapId, discoveryKey }) {
  // The brief is accepted, so the discovery ticket is done, as an agent would close it.
  await call('claim_ticket', { ticket: discoveryKey });
  await call('close_ticket', { resolution: 'Brief accepted.', noCodeReason: 'Discovery only; no code change.' });
  const index = await call('add_ticket', { title: 'Index every release in memory', type: 'execute' });
  await call('challenge_assumption', {
    assumption: 'S-1',
    evidence: 'The release notes already hold 1,400 releases (`fixed.txt` history); an in-memory index is too big.',
  });
  const proposed = await call('propose_replan', {
    reason: 'There are far more releases than the brief assumed, so search needs a prebuilt index.',
    evidence: 'S-1 is wrong: 1,400 releases today.',
    invalidates: ['S-1'],
    changes: [
      { op: 'cancel_ticket', ticket: index.ticket.key, reason: 'Assumed a few hundred releases' },
      { op: 'add_ticket', ref: 'build-index', title: 'Build a search index at deploy time', type: 'execute' },
      {
        op: 'add_ticket',
        ref: 'load-index',
        title: 'Load the prebuilt index in the page',
        type: 'execute',
        blockedBy: ['build-index'],
      },
    ],
  });
  const frozen = await refused(call('claim_ticket', { ticket: index.ticket.key }));
  await page.locator('.replan-banner button', { hasText: 'Review' }).click({ timeout: 20_000 });
  await page.locator('.replan-dialog').waitFor();
  await shot('12-replan-review');
  await page.locator('.replan-approve').click();
  await page.locator('.node', { hasText: /Build a search/ }).waitFor({ timeout: 20_000 });
  await page.locator('.replan-banner').waitFor({ state: 'detached', timeout: 15_000 });
  await shot('13-replan-applied');
  const journal = fs
    .readFileSync(path.join(repo, '.miloops', '.events', `${mapId}.jsonl`), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((e) => e.kind === 'replan')
    .map((e) => e.action);
  const next = await call('claim_ticket');
  const ok =
    proposed.status === 'pending' &&
    /frozen/.test(frozen) &&
    ['proposed', 'approved', 'applied'].every((a) => journal.includes(a)) &&
    next.claimed.title === 'Build a search index at deploy time';
  return { ok, frozen, journal, next: next.claimed.title };
}

/** Runs the M4 steps; returns whether all passed. */
export async function verifySupervision(ctx) {
  const ranked = await rankedQuestions(ctx);
  ctx.log(`attention ${ranked ? 'ok' : 'WRONG'}: the blocking question ranks above the fyi one in the queue`);
  const risk = await riskyDecision(ctx);
  ctx.log(`risk policy ${risk.ok ? 'ok' : 'WRONG'}: ${risk.msg.split('\n')[0].slice(0, 140)}`);
  const replan = await replanFlow(ctx);
  ctx.log(
    `replan ${replan.ok ? 'ok' : 'WRONG'}: frozen claim refused (${replan.frozen.slice(0, 80)}), approved in the command center, journal ${replan.journal.join(' → ')}, next claim "${replan.next}"`,
  );
  return ranked && risk.ok && replan.ok;
}
