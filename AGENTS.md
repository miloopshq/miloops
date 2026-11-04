# AGENTS.md

How to change MILOOPS safely. For coding agents (Codex reads this file; Claude Code reads it through `CLAUDE.md`) and for people. Read it before you start. Code standards live in `CONTRIBUTING.md`; this file links to them rather than repeating them.

**Keep this current.** A PR that changes the architecture, a data location or one of the recipes below updates this file in the same PR. `packages/core/test/agents-md.test.ts` fails if a path written here doesn't exist.

## What MILOOPS is

MILOOPS is a local command center for big work done by AI coding agents. A human describes a mission. Agents chart it as a map of decision tickets (`research`, `prototype`, `grilling`, `task`, `execute`, plus `review`) with blocking edges, claim tickets over MCP, ask the human questions, and record decisions with evidence. The human steers in the command center, a web app served by the `miloops` CLI on their machine. MILO is the operator voice: briefings, framing questions and system lines.

## Product rules

Every change follows these. If a task seems to need breaking one, stop and ask.

- **Agent-agnostic.** Everything goes through MCP tools. Nothing may depend on one model or vendor, and MILOOPS never calls a model itself. Agents write briefs, knowledge and criteria; MILOOPS gives them structure and enforces gates in code.
- **Local-first.** State is plain files in the repo's `.miloops/` folder, or in the user's GitHub or Linear tracker. The local product never needs a MILOOPS server. The paid hosted mode is optional, and nothing local may depend on it.
- **Deterministic core.** Lifecycle, state, gates, ranking and selection are code, not prompts. The same inputs always give the same result, and every automated choice carries a human-readable reason.
- **Evidence over claims, and human leverage.** MILOOPS never answers a question or approves anything on the human's behalf. Agents may decide low-risk matters themselves when allowed, and must record those decisions where the human can review them.
- **Not an executor (locally).** The local product doesn't start, schedule or run agents. It may prepare workspaces (git worktrees) for agents that ask.
- **Not a feed of agent activity.** If a feature only makes the activity feed prettier, it doesn't belong here.

## Architecture map

npm workspaces monorepo. Node 20+, TypeScript, ESM.

| Path | What it is |
| --- | --- |
| `packages/core` | The engine, UI-free: the mission model, tracker adapters, planning and lifecycle, verification, evidence, agent coordination and the HTTP bridge. Zero runtime dependencies. Entry points in `packages/core/package.json` `exports`: `.` (`src/index.ts`), `./node`, `./bridge`, `./agents`. |
| `packages/cli` | The `miloops` command, published as `miloops-cli` (bin `miloops`). It serves the command center and the bridge (`src/serve/`), runs the MCP server (`src/mcp/`), connects agents (`src/connect.ts`) and meters usage (`src/usage/`). Built into one bundle by `packages/cli/build.mjs`. |
| `apps/command-center` | The React + Vite web UI, bundled into the CLI. |
| `packages/connector-slack` | The optional Slack connector: questions, approvals and briefings in Slack. |
| `packages/milo-avatar` | The MILO pixel avatar: a React component and a framework-free renderer (`mountMilo`). |
| `scripts` | Dev tooling: the seed (`scripts/seed-dev.ts`, with M4's policy, assumptions and proposals in `scripts/seedSupervision.ts`), scripted MCP dev agents (`scripts/dev-agent.mjs`), the end-to-end check (`scripts/verify-mcp.mjs`, M4 steps in `scripts/verifySupervision.mjs`) and the local npm registry (`scripts/registry-local.mjs`). |
| `.github/workflows` | CI (`ci.yml`, runs `npm run check`) and the manual Release workflow (`release.yml`). |

The landing site lives in its own repo, `miloopshq/miloops-landing`.

### Tracker data (`.miloops/` in the user's repo)

- `<mission>/map.md`: mission frontmatter plus the map body (Destination, Notes, Assumptions, Decisions so far, Not yet specified, Out of scope). Assumptions are `S-<n>` lines with their status (holding, challenged, invalidated, confirmed), linked tickets and challenge in an HTML comment marker (`packages/core/src/model/assumptionLine.ts`); accepting a brief adds its assumptions. The format is shared by every adapter (`packages/core/src/model/mapBody.ts`).
- `<mission>/tickets/<n>.md`: ticket frontmatter, body and comments. `<mission>/decisions/<D-n>.md`: decision records.
- `verification.json`: the checks agents' completions run. Committed.
- `briefs/<mapId>.md`: the mission's discovery brief and its status. A mission with a brief requires discovery: implementation tickets can't be claimed until the operator accepts it. Committed.
- `criteria/<mapId>.md`: acceptance criteria per ticket (`AC-<n>`, kind, optional knowledge source) and the operator's confirmation. Required for implementation tickets on missions with a brief; each needs evidence when the work is completed. Committed.
- `knowledge/K-<n>.md`: project and product knowledge entries (suggested, confirmed, assumption, outdated). Committed, so teammates share it.
- `policy.json`: the risk policy, what always needs the human: a level (low, medium, high) per category and path rules (`packages/core/src/policy/`). Agents can't record high-risk decisions themselves. Optional (defaults apply); committed.
- `attention.json`: the team's attention policy (kind weights, the interrupt threshold, the digest cadence). Optional; committed. Each person's focus hours and notification channel live in `attention.json` in their user config dir, never in the repo.
- `.attention/state.json`: snoozes and dismissals of attention items. Local only, git-ignored.
- `.events/<mapId>.jsonl`: the append-only lifecycle journal (`packages/core/src/history/journalFile.ts`): transitions and replan steps. Local only, git-ignored.
- `.replans/<mapId>/R-<n>.json`: replan proposals (typed changes, status, what was applied). A pending one freezes the tickets it touches; only the operator approves or rejects. Local only, git-ignored.
- `.evidence/`: verification attempts, check output and git evidence per ticket.
- `.agents/`: cross-process coordination between MCP processes and the command center, including sessions, answers, leases, callsigns and the server lock.

GitHub Issues and Linear store the map and tickets in the tracker instead (`packages/core/src/adapters/remote/`), with the same body format. The local folders above are still used for the journal, evidence and agents.

### Core modules (`packages/core/src`)

- `model/`: types (`types.ts`: `MapDoc`, `Ticket`, `TicketType`), lifecycle phases and journal entries (`lifecycle.ts`), frontmatter and map body formats, the product name and slug (`brand.ts`).
- `adapters/`: the `TrackerAdapter` interface (`adapter.ts`), the markdown adapter (`markdown/`), GitHub and Linear (`remote/`), and an in-memory adapter for tests.
- `planning/`: graph derivation (`derive.ts`), charting and other operations (`operations/`), lifecycle transitions (`lifecycle/`), decisions (`decisions/`), metrics and the away briefing (`briefing.ts`).
- `verification/` and `evidence/`: checks, review, approvals, outcomes, git evidence and PR/CI sync.
- `agents/`: leases, callsigns, agent docs and returning stalled claims to the queue.
- `discovery/`: the discovery brief model, file format, gate (`claimableTypes`, `gateReason`) and store.
- `criteria/`: acceptance criteria, matching them to completion evidence (`checkCriteria`), and the store.
- `knowledge/`: knowledge entries, file format, search, per-ticket selection (`selectKnowledge`), staleness from file hashes, and the store.
- `policy/`: the risk policy: defaults, file parser, store, `riskLevelFor` (the level of a call from its category and paths), `policyViolations` and `decisionsByRisk`.
- `planning/assumptions/` and `planning/replan/`: mission assumptions (add, seed from the brief, challenge, confirm, settle) and replan proposals: `validateReplan`, `replanDiff` (the dry run), `frozenTickets`, `applyReplan` (idempotent, resumable), the store and `replanTriggers` (signs a replan may be needed).
- `attention/`: the attention queue. `buildAttention` ranks everything that needs the human (pure, explainable `reasons`), one source per kind in `attention/sources/` registered in `sources/registry.ts`, scoring, batching, the policy and prefs parsers, and `isInterrupting` (focus hours).
- `activity/`: the activity stream, presence and usage.
- `server/`: the HTTP bridge (`trackerBridge.ts`), its route handlers (`*Routes.ts`), the `/events` SSE stream and the background loops (`watchLeases.ts`, `watchVerification.ts`, `watchTrackerFolder.ts`, `watchAttention.ts`).

### MCP server (`packages/cli/src/mcp`)

- `server.ts` creates the server; `toolKit.ts` defines how tools are declared (zod schemas, results and errors).
- Tools are grouped in `tools/` (`missionTools.ts`, `ticketTools.ts`, `workTools.ts`, `hitlTools.ts`, `knowledgeTools.ts`, `replanTools.ts`). Their behaviour lives in `mission/` (mission ops, ticket ops, HITL, completion, reviews, leases, sessions, the risk check, the attention summary, assumptions and replans).
- `instructions.ts` holds the server instructions every agent gets. `packages/cli/commands/milo.md` is the `/milo` command for Claude Code (and the Codex prompt).

### Command center (`apps/command-center/src`)

- `App.tsx` lays out the zones. `app/` wires the header, map zone, laptop and phone layouts, and dialogs.
- `features/<feature>/` holds one folder per zone or dialog (inbox, map, inspector, activity, plan, decisions, briefing, settings, verification, …).
- Live updates: hooks that refetch when a tracker file changes subscribe through `lib/trackerChanges.ts` (one shared `/events` stream). Don't open a new `EventSource` per hook: browsers allow six connections per host, and requests queue behind open streams.
- `components/ui/` holds the design-system primitives, `hooks/` app-wide hooks (`useCommandCenter.ts` loads data and subscribes to SSE), `lib/` helpers, and `styles/` the CSS per area (tokens in `styles/design-system.css`).
- The in-app changelog is `features/settings/releases.ts`.

## Conventions

Follow `CONTRIBUTING.md`: one export per file, 200 lines max, the layout rules, inline type imports, naming, where tests and fixtures go, and its **Readable code** rules (no nested ternaries, early returns, flat nesting, object parameters, small functions, explicit variants). Lint enforces the mechanical ones; write the rest in the same spirit. Run `npm run format` on files you touch.

## Recipes

**Add an MCP tool.**
1. Declare it in the right `packages/cli/src/mcp/tools/*Tools.ts` with a zod schema, title and description; mark read-only tools `readOnly`.
2. Put the behaviour in `packages/cli/src/mcp/mission/`, with core logic in `packages/core` when it's more than glue.
3. Describe when to use it in `packages/cli/src/mcp/instructions.ts` and `packages/cli/commands/milo.md`.
4. Cover it in `packages/cli/test/` (`mcp*.test.ts`) and drive it end to end in `scripts/verify-mcp.mjs`.

**Add a bridge route and SSE event.**
1. Add a `handleX(req, res, ctx)` in `packages/core/src/server/<name>Routes.ts` that takes the shared `RouteContext` (`routeContext.ts`) and returns `true` when it handled the request, following `leaseRoutes.ts`.
2. Mount it in `trackerBridge.ts` next to the others.
3. Push changes with `send('event: x\ndata: …\n\n')` from a route or a loop (see `watchLeases.ts`), and subscribe in `apps/command-center/src/hooks/useCommandCenter.ts`.
4. Operator-only actions are journaled.

**Add a journal entry kind.** Extend the entry types in `packages/core/src/model/lifecycle.ts` and keep the reader in `journalFile.ts` tolerant of unknown kinds. Old journals must still load. Add a test with a mixed old and new journal.

**Add a command-center zone, view or setting.**
1. Create `apps/command-center/src/features/<name>/` with an `index.ts` barrel, and styles in `styles/`.
2. Settings sections go in `features/settings/` (see `SettingsSection.tsx`); full views opened from the header follow `features/decisions/`.
3. Check the wide, laptop and phone layouts (`app/LaptopSide.tsx`, `app/PhoneView.tsx`). Zone titles carry an info tip (`components/ui/InfoTip.tsx`).

**Add a changelog entry.** Add a plain-language line to `NEXT` or the current release in `apps/command-center/src/features/settings/releases.ts`.

**Extend the end-to-end check.** `scripts/verify-mcp.mjs` drives a real mission through the built CLI and a browser. Add steps for new tools or UI, assert on what the user sees, and avoid timing races: wait on state, not sleeps.

## Checks

- `npm run check` runs everything CI runs: lint, the Prettier check, typecheck, build, the vitest and node:test suites, and `verify:mcp` (needs a build and Chrome; set `CHROME` to its path). It must pass before a PR.
- **Run the app on the dev seed:** `npm run dev` resets the dev project to the seed and starts the command center with hot reload. `npm run build -w miloops-cli && npm run dev:agent` adds real MCP agents working it. `npm run dev:empty` starts on a brand-new empty tracker folder instead, for the first-run flow.
- `main` is protected: one PR per change, merged after CI passes. Releases are covered in `CONTRIBUTING.md`.
