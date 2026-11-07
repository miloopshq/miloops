#!/usr/bin/env node
const WORDMARK = [
  '████████╗███████╗ █████╗ ███╗   ███╗████████╗██████╗  █████╗ ██╗██╗     ',
  '╚══██╔══╝██╔════╝██╔══██╗████╗ ████║╚══██╔══╝██╔══██╗██╔══██╗██║██║     ',
  '   ██║   █████╗  ███████║██╔████╔██║   ██║   ██████╔╝███████║██║██║     ',
  '   ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║   ██║   ██╔══██╗██╔══██║██║██║     ',
  '   ██║   ███████╗██║  ██║██║ ╚═╝ ██║   ██║   ██║  ██║██║  ██║██║███████╗',
  '   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝',
];
const out = process.stdout;
const color = !('NO_COLOR' in process.env);
const moss = color ? '\x1b[38;2;143;191;132m' : '';
const reset = color ? '\x1b[0m' : '';

// Same as the real CLI's greeting: only for people, in a terminal wide enough for it.
if (out.isTTY && (out.columns ?? 80) >= 76) {
  console.log(`\n${WORDMARK.map((row) => `  ${moss}${row}${reset}`.trimEnd()).join('\n')}`);
}

console.log(`
  Teamtrail isn't released yet.

  The trail map for your AI coding agents.
  Try the preview: npx teamtrail@next
  Learn more: https://teamtrail.app
`);
