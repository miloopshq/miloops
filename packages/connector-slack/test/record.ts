/**
 * Re-records the fixtures:  node packages/connector-slack/test/run.mjs record
 * Flows run against test/fakes (deterministic; no network, no tokens). Each
 * fixture keeps the Web API exchanges (method, path, body; never headers with
 * tokens) and the Socket Mode envelopes with the acks MILO sent back.
 */
import { freezeTime, world } from './harness';
import { askFlow, decisionFlow, notifyFlow, setupFlow, statusFlow } from './scenarios';

const NOTE = 'Recorded against test/fakes/slack.ts; request and response shapes follow api.slack.com (Web API methods, Socket Mode envelopes, Block Kit payloads).';

const flows: [string, (w: ReturnType<typeof world>) => Promise<unknown>, string][] = [
  ['slack-setup.json', setupFlow, 'Guided setup: wrong token type, app-level token, bot token missing a scope, bot token, Home tab, owner claim.'],
  ['slack-ask.json', askFlow, 'Agent questions as DMs: refused click, button answer, late click, answer in the command center, Reply… modal, agent gone.'],
  ['slack-decision.json', decisionFlow, 'Save as decision on a thread (refused, modal, mission switch, validation, save), bot not in channel, /milo decide as mission only.'],
  ['slack-status.json', statusFlow, '/milo help, status (all and one mission), inbox, unknown subcommand, refusal.'],
  ['slack-notify.json', notifyFlow, 'Blocked and mission-done notifications in the owner DM, threaded per mission per day.'],
];

const thaw = freezeTime();
try {
  for (const [name, flow, notes] of flows) {
    const w = world('record', name);
    try {
      await flow(w);
      w.save(`${NOTE} ${notes}`);
    } finally {
      w.cleanup();
    }
  }
} finally {
  thaw();
}
console.log('recorded slack fixtures');
