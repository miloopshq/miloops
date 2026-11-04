<img src="brand/miloops-banner.gif" alt="MILO, the MILOOPS operator, cycling through watching, processing, transmitting and decision waiting next to the MILOOPS wordmark." width="100%" />

# MILOOPS

> One command center. Every agent. Total operational awareness.

**Mission:** MILOOPS is the place where a human can define an objective, assemble the right AI capabilities, delegate work, follow meaningful progress, intervene when necessary and trust the outcome.

**The name:** MILO is the Mission Intelligence & Logistics Operator. MILOOPS is MILO Operations, the command center where MILO runs your agents' missions.

MILOOPS is a local command center for planning and executing big work with your AI coding agents. You describe a mission; your agents chart it as decision tickets, work through them, and bring the calls that need you to a single inbox. MILO, the command center's operator, briefs you on what changed while you were away and keeps spend and token usage in view.

- **Missions and decision tickets:** a live map of what's decided, in progress, blocked and out of scope.
- **Waiting on you:** every question from every agent, in one inbox, answered in-window.
- **Decision records:** each call is written down with its alternatives, rationale and transcript.
- **Live spend:** per-session and per-mission tokens and cost.
- **Your data stays yours:** missions are plain markdown in `./.miloops/` in your repo. Nothing leaves your machine.

Works with any coding agent that connects over MCP. Claude Code and Codex are the primary supported agents.

## Why MILOOPS

Your agents can already write the code. What's missing is a place to run them like a team: one where you set the direction, they do the work, and you make the calls that matter.

- **Bring any agent.** Everything runs through MCP tools. Claude Code today, Codex tomorrow, both at once. MILOOPS never calls a model itself and never locks you into a vendor.
- **Local-first, for real.** Missions live as plain files in your repo's `.miloops/` folder, or in the GitHub Issues or Linear tracker you already use. There is no MILOOPS server, and there never will be.
- **A deterministic core.** Lifecycle, state and ranking are code, not prompts. The same inputs always give the same result, so you can trust what the map tells you.
- **Evidence over claims.** Agents bring the decisions that matter to you, with the alternatives and the reasoning, and you decide. Less babysitting, not less judgment.
- **Not another activity feed.** MILOOPS isn't a prettier log of what agents did. It's where work gets steered.

## Roadmap

Where MILOOPS is heading, in the order we plan to build it:

1. **Safe parallel work.** Each agent can work in its own copy of your project, and you hear about it before two of them change the same thing.
2. **Multi-repository supervision.** Run missions across all your repos from one command center, with a single merged queue.
3. **Agent roles and specialists.** Give agents roles (reviewer, researcher, builder) and bring in specialists for focused jobs, starting with a built-in reviewer that wraps today's independent review.

Already shipped from this roadmap: one ranked queue of what needs you, project knowledge, and missions that adapt when an assumption breaks.

Coming alongside: **model-aware claiming**, a per-mission switch that sends hard decisions to stronger models and routine work to cheaper ones. With roles, a role can set its own model tier.

## Install

Requires Node 20+.

```bash
npm i -g miloops-cli      # or, without installing: npx miloops-cli
cd your-repo
miloops
```

`miloops` opens the command center in your browser. Run `miloops --help` for options.

Connect your agent once, then use `/milo new "<idea>"`, `/milo resume`, `/milo status` and `/milo inbox`:

```bash
claude mcp add miloops -- npx -y miloops-cli mcp   # Claude Code; `npx miloops-cli connect claude` also adds /milo
codex mcp add miloops -- npx -y miloops-cli mcp    # Codex; see packages/cli for the config.toml entry
```

Details for both agents are in [`packages/cli/README.md`](packages/cli/README.md#connect-your-coding-agent).

## Repository

| Path | Package | |
| --- | --- | --- |
| [`packages/core`](packages/core) | `@miloops-hq/core` | UI-free engine: missions, tickets, trackers, metrics, decision records |
| [`packages/cli`](packages/cli) | [`miloops-cli`](https://www.npmjs.com/package/miloops-cli) | The `miloops` command: serves the command center and the tracker API |
| [`packages/milo-avatar`](packages/milo-avatar) | `@miloops-hq/milo-avatar` | Pixel-art MILO avatar (React component and framework-free renderer) |
| [`apps/command-center`](apps/command-center) | private | The command-center web UI bundled into the CLI |
| [`brand`](brand) | | Logos, avatars and social images |

The landing site lives in [miloopshq/miloops-landing](https://github.com/miloopshq/miloops-landing).

## Develop

```bash
npm install
npm run dev           # resets the dev project to the seed, then the command center with hot reload
npm run dev:agent     # real MCP agents working the dev project (after npm run build -w miloops-cli)
npm run dev:empty     # the command center on a brand-new empty folder: the first-run, no-mission flow
npm run typecheck     # every workspace
npm test              # unit and MCP tests (vitest)
npm run verify:mcp    # after a build: an MCP client drives a mission while the command center shows it
npm run build         # every workspace; the CLI lands in packages/cli/dist
npm start             # run the built CLI (same as `miloops`)
npm run lint          # ESLint across the monorepo
npm run check         # lint, typecheck, build, test and verify:mcp; run before opening a PR
```

See [`apps/command-center/README.md`](apps/command-center/README.md) for the architecture, metrics and tracker API, and [`CONTRIBUTING.md`](CONTRIBUTING.md) for code standards.

## License

[FSL-1.1-ALv2](LICENSE) (Functional Source License, Apache 2.0 future license): free to use, modify and run, including at work, for anything except a competing product. Each release becomes Apache 2.0 two years after it ships. Third-party credits are in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
