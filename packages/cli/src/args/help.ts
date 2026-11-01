import { BRAND, DEFAULT_LEASE_MINUTES, LEASE_MINUTES_ENV } from '@miloops-hq/core';

export const HELP = `${BRAND.name} — ${BRAND.category}

Usage: ${BRAND.slug} [options]
       ${BRAND.slug} mcp [--dir <path>] [--agent <callsign>] [--lease-minutes <n>]
       ${BRAND.slug} connect claude|codex [--dir <path>]
       ${BRAND.slug} connect slack [options]

Starts the command center for the current folder and opens it in your browser.

Commands:
  mcp            Serve the MCP server for coding agents over stdio
                 (claude mcp add ${BRAND.slug} -- npx -y ${BRAND.slug} mcp)
                 A claimed ticket returns to the queue after --lease-minutes without a
                 tool call from its agent (default: ${DEFAULT_LEASE_MINUTES}, or $${LEASE_MINUTES_ENV})
  connect <agent>  Register the MCP server with Claude Code or Codex and add the /milo command
                 (for Claude Code also a SessionStart hook, so usage comes from the transcript)
  connect slack  Start the command center on the Slack setup (Socket Mode from this machine;
                 tokens stay in your local credential store)
  hook claude    The SessionStart hook itself (reads the hook payload on stdin)

Options:
  --dir <path>   Tracker folder (default: ./${BRAND.dataDir}, or $${BRAND.dataDirEnv})
  --port <n>     Port to listen on (default: 7420; the next free port is used if taken)
  --host <addr>  Interface to bind (default: 127.0.0.1)
  --no-open      Don't open the browser
  --demo         Open a sample mission with simulated agents; nothing is saved
  -v, --version  Print the version
  -h, --help     Show this help
`;

export function fail(msg: string): never {
  process.stderr.write(`${BRAND.slug}: ${msg}\nRun \`${BRAND.slug} --help\` for usage.\n`);
  process.exit(2);
}
