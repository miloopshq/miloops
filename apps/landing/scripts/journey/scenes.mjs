// Terminal and Claude Code scenes for the journey video. `type` lines are typed after the prompt.
const CC = '> ';

export const SETUP = [
  { t: 'npm i -g miloops', type: true },
  { t: 'added 1 package in 2s', cls: 'dim' },
  { t: 'cd fieldnote-app', type: true },
  { t: 'npx miloops connect claude', type: true },
  { t: '' },
  { t: 'MILOOPS · connect Claude Code', cls: 'acc' },
  { t: '  /milo command   added        .claude/commands/milo.md' },
  { t: '  MCP server      registered   claude mcp add miloops -- npx -y miloops mcp' },
  { t: '  In Claude Code: /milo new "&lt;idea&gt;", /milo resume, /milo status, /milo inbox', cls: 'dim' },
  { t: '' },
  { t: 'miloops', type: true },
  { t: '' },
  { t: '  MILOOPS 0.7.0 · MILO online', cls: 'ok' },
  { t: '  Command center  http://localhost:7420/' },
  { t: '  Tracker         .miloops/' },
  { t: '  Press Ctrl+C to stop.', cls: 'dim', pause: 1600 },
];

export const FRAME = [
  { t: '✻ Welcome to Claude Code', cls: 'acc box' },
  { t: '  cwd: ~/fieldnote-app · MCP: miloops connected', cls: 'dim' },
  { t: '' },
  { t: '/milo new "Team workspaces for Fieldnote"', type: true, prompt: CC },
  { t: '● miloops · ask_human (framing: true)', cls: 'ok' },
  { t: '  ⎿ Mission draft opened · also live in the command center', cls: 'dim' },
  { t: '● MILO 1/4  Who is this for?', cls: 'milo' },
  { t: 'Team admins at companies already using Fieldnote.', type: true, prompt: CC },
  { t: '● MILO 2/4  What does done look like?', cls: 'milo' },
  { t: 'A team shares notebooks with roles, and admins sign in with SSO.', type: true, prompt: CC },
  { t: '● MILO 3/4  What is out of scope for now?', cls: 'milo' },
  { t: 'Native desktop apps and billing changes.', type: true, prompt: CC },
  { t: '● miloops · start_mission ("Ship team workspaces", 8 tickets)', cls: 'ok' },
  { t: '● Mission #18 is mapped. One decision is waiting on you.', cls: 'milo', pause: 1600 },
];

export const AGAIN = [
  { t: 'miloops', type: true },
  { t: '' },
  { t: '  MILOOPS 0.7.0 · MILO online', cls: 'ok' },
  { t: '  Command center  http://localhost:7420/' },
  { t: '  Last mission    #18 Ship team workspaces', cls: 'dim', pause: 1300 },
];

export const RESUME = [
  { t: '✻ Welcome back to Claude Code', cls: 'acc box' },
  { t: '' },
  { t: '/milo resume', type: true, prompt: CC },
  { t: '● miloops · resume_mission (#18)', cls: 'ok' },
  { t: '  ⎿ Inbox clear · 1 decision logged · 2 tickets unblocked', cls: 'dim' },
  { t: '● miloops · claim_ticket (#22)', cls: 'ok' },
  { t: '  ⎿ Claimed #22 Spike the riskiest integration point', cls: 'dim', pause: 1500 },
];

export const CHECK_IN = [
  { t: '/milo status', type: true, prompt: CC },
  { t: '● miloops · status', cls: 'ok' },
  { t: '  #18 Ship team workspaces · 3 of 8 decided' },
  { t: '  Running   claude-33 · #22 Spike the riskiest integration point', cls: 'dim' },
  { t: '  Spend     $0.21 · 52k tokens', cls: 'dim' },
  { t: '' },
  { t: '/milo inbox', type: true, prompt: CC },
  { t: '● miloops · list_inbox', cls: 'ok' },
  { t: '  1 waiting on you' },
  { t: '  #23 What does "done" look like for v1?', cls: 'milo', pause: 1600 },
];
