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

1. **Attention management.** One ranked queue of everything that needs you, so the most important call always comes first. Every later feature reaches you through it.
2. **Project knowledge.** MILOOPS remembers what your missions learned, including the dead ends, so agents stop re-trying what already failed. New knowledge waits in your queue for review.
3. **Adaptive missions.** When an assumption breaks, agents propose a replan instead of pushing on. You approve it from your queue, and the broken assumption becomes project knowledge.
4. **Multi-repository supervision.** Run missions across all your repos from one command center, with a single merged queue.
5. **Agent roles and specialists.** Give agents roles (reviewer, researcher, builder) and bring in specialists for focused jobs, starting with a built-in reviewer that wraps today's independent review.

Coming alongside: **model-aware claiming**, a per-mission switch that sends hard decisions to stronger models and routine work to cheaper ones. With roles, a role can set its own model tier.

## Install

Requires Node 20+.

```bash
npm i -g miloops      # or, without installing: npx miloops
cd your-repo
miloops
```

`miloops` opens the command center in your browser. Run `miloops --help` for options.

Connect your agent once, then use `/milo new "<idea>"`, `/milo resume`, `/milo status` and `/milo inbox`:

```bash
claude mcp add miloops -- npx -y miloops mcp   # Claude Code; `npx miloops connect claude` also adds /milo
codex mcp add miloops -- npx -y miloops mcp    # Codex; see packages/cli for the config.toml entry
```

Details for both agents are in [`packages/cli/README.md`](packages/cli/README.md#connect-your-coding-agent).

## Repository

| Path | Package | |
| --- | --- | --- |
| [`packages/core`](packages/core) | `@miloops-hq/core` | UI-free engine: missions, tickets, trackers, metrics, decision records |
| [`packages/cli`](packages/cli) | [`miloops`](https://www.npmjs.com/package/miloops) | The `miloops` command: serves the command center and the tracker API |
| [`packages/milo-avatar`](packages/milo-avatar) | `@miloops-hq/milo-avatar` | Pixel-art MILO avatar (React component and framework-free renderer) |
| [`apps/command-center`](apps/command-center) | private | The command-center web UI bundled into the CLI |
| [`apps/landing`](apps/landing) | private | The [miloops.app](https://miloops.app) site |
| [`brand`](brand) | | Logos, avatars and social images |

## Develop

```bash
npm install
npm run dev           # resets the dev project to the seed, then the command center with hot reload
npm run dev:agent     # real MCP agents working the dev project (after npm run build -w miloops)
npm run dev:landing   # landing page
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
