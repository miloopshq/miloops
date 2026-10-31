# miloops

MILOOPS, the Autonomous Agent Command Center. One command opens a local command center for the agents working in your repo.

```bash
npm i -g miloops      # or skip the install: npx miloops
cd your-repo
miloops
```

`miloops` starts a local server, opens the command center in your browser and keeps missions as markdown in `./.miloops/` in the current folder. Commit that folder or ignore it; agents and people can edit the files directly, and changes show up live.

| Option | Default | |
| --- | --- | --- |
| `--dir <path>` | `./.miloops` (or `$MILOOPS_DIR`) | Tracker folder |
| `--port <n>` | `7420`, next free port if taken | Port |
| `--host <addr>` | `127.0.0.1` | Interface to bind. The server can write files in the tracker folder, so only expose it on networks you trust. |
| `--no-open` | | Don't open the browser |

Requires Node 20 or newer. No other runtime dependencies.

## Connect your coding agent

The same package ships an MCP server, `miloops mcp`, that your agent starts over stdio. Nothing else to install. Run `miloops` in the repo as well to watch the agent live and answer its questions in the command center.

### Claude Code

```bash
claude mcp add miloops -- npx -y miloops mcp
```

Or let `miloops` do it and add the `/milo` command to the repo (`.claude/commands/milo.md`):

```bash
npx miloops connect claude
```

Then, in Claude Code:

| Command | Does |
| --- | --- |
| `/milo new "<idea>"` | Frames the idea with you, then charts a mission |
| `/milo resume [mission]` | Picks up the mission and works ready tickets |
| `/milo status` | Progress, running sessions, what's waiting and blocked, spend |
| `/milo inbox` | Questions waiting on you; answer them in the chat |

### Codex

```bash
codex mcp add miloops -- npx -y miloops mcp
```

or in `~/.codex/config.toml`:

```toml
[mcp_servers.miloops]
command = "npx"
args = ["-y", "miloops", "mcp"]
# ask_human waits for your answer; Codex cancels tool calls after 60 s by default.
tool_timeout_sec = 900
```

`npx miloops connect codex` prints this and installs the same command as a Codex prompt (`~/.codex/prompts/milo.md`): `/prompts:milo new "<idea>"`, `/prompts:milo resume`, and so on.

### Other agents

Any MCP client works: run `npx -y miloops mcp` over stdio in the repo. `--dir <path>` (or `$MILOOPS_DIR`) picks another tracker folder; `--agent <callsign>` fixes the session name, which otherwise comes from the client (`claude-01`, `codex-01`).

### Tools

| Tool | |
| --- | --- |
| `status` | Missions, progress, ready / claimed / blocked tickets, sessions, waiting questions, decisions, spend |
| `start_mission` | Create a mission: destination, notes, decided, not yet specified, out of scope, tickets with blocking edges |
| `resume_mission` | Open a session on a mission; returns status, your claim and the next ready ticket |
| `update_mission` | Edit destination or notes, add Not yet specified / Out of scope lines, switch mode |
| `next_ticket` | The next ready ticket with its blockers' decisions (does not claim) |
| `claim_ticket` / `release_ticket` | Assign a ticket to the agent (next ready by default) / give it back |
| `add_ticket` | Add a ticket or promote a Not yet specified line |
| `report_progress` | Step, log line, chat message; tokens and cost only when no agent log is read (see Usage) |
| `close_ticket` | Resolve (or rule out) a ticket: resolution comment, close, DecisionRecord, unblocked tickets |
| `record_decision` | Keep any other decision as a DecisionRecord |
| `ask_human` / `wait_for_answer` | Ask the human through the command center inbox and wait for the answer |
| `list_inbox` / `answer_question` | Questions from every agent; answer one with the human's words from the chat |

Sessions, questions and usage reach the command center through `.miloops/.agents/`, so the agent and the command center can start in any order.

### Usage

Tokens and cost per session are measured from the agent's own local logs, priced at list rates, and tagged `LOG` in the sessions area:

- **Claude Code:** the session transcript (`~/.claude/projects/<project>/<session>.jsonl`). `connect claude` also adds a silent `SessionStart` hook to `.claude/settings.local.json` that records which transcript belongs to the repo.
- **Codex:** the session rollout (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`), found from the tool call's thread id. Nothing to install.

Other agents report usage through `report_progress`; those numbers are tagged `SELF`. Nothing leaves your machine.

Concepts derived from mattpocock/skills (MIT); see `THIRD_PARTY_NOTICES.md`.
