# Product vision

**MILOOPS is the intelligence and operations layer between humans and autonomous AI agents.**

Short version: _Mission control for AI agents._

This document exists so that MILOOPS does not drift, one reasonable-looking change at a time, into a conventional autonomous PR pipeline. Read it before you propose a feature. That applies to people and to coding agents alike.

## Principles

1. **Agent-agnostic.** Claude Code, Codex and whatever comes next are execution resources, not the product. MILOOPS works through open interfaces (MCP today), and no feature may depend on one provider's private behavior. If an agent disappears tomorrow, MILOOPS should still make sense.
2. **Missions, not just tickets.** A mission is a larger objective with a goal, constraints and decisions. Tickets are an implementation detail: the way a mission is broken down and tracked. Features should help people steer the objective, not just move tickets across a board.
3. **Human leverage.** MILOOPS reduces the attention a person needs to run complex work. It does not remove meaningful human control. Agents bring the calls that matter to a person; the person decides. Less babysitting, not less judgment.

## Commitments

- **Local-first.** Companies own their data. Missions, decisions and history live as plain files in each repo's `./.miloops/`. No MILOOPS server holds them, and none is required to use the product.
- **Deterministic core, intelligent agents.** MILOOPS controls lifecycle and state: what a mission is, which ticket is claimed, what is done, what is waiting on a human. Agents do the reasoning and the implementation. State transitions are code, not prompts, and they behave the same way every time.
- **Evidence over claims.** "Done" means verified, not announced. A ticket closes on evidence such as passing checks, a linked commit or a recorded decision, not because an agent said it finished.

## Non-goals

- **Not another UI for watching agents open PRs.** A feed of agent activity and pull requests is not the product. If a feature only makes that feed prettier, it does not belong here.
- **Not a Claude-only or single-provider system.** No feature may require a specific model, vendor or agent to work.
- **No mandatory cloud.** Optional sync with tools people already use (GitHub, Linear, Slack) is fine. A hosted MILOOPS backend that users must sign up for is not.
- **No feature sprawl.** Every feature must serve the principles above. "A competitor has it" is not a reason on its own.

## What exists today

The directions below build on pieces that already ship:

- **HITL inbox ("Waiting on you").** Every question from every agent, in one place.
- **Decision records.** Each call is written down with its alternatives, rationale and transcript.
- **Handoff notes.** What one session leaves for the next.
- **Per-repo `.miloops/`.** Missions, tickets and decisions as plain markdown in the repo.

## Long-term directions

These are directions, not commitments. They describe where MILOOPS could go and how each idea grows from what already exists. None of them is scheduled.

- **Human attention management.**
  - What it means: MILOOPS decides what deserves a person's attention, when, and in what order.
  - Builds on: the HITL inbox and MILO's briefings, grown into prioritized, batched decisions.
- **Persistent project intelligence.**
  - What it means: a project remembers its decisions, conventions and dead ends, and every new agent session starts with that context.
  - Builds on: decision records and handoff notes kept in `.miloops/`.
- **Adaptive missions.**
  - What it means: when an assumption behind a mission turns out to be wrong, the mission replans and asks a person to confirm the new plan.
  - Builds on: mission state plus decision records that capture the assumptions behind each call.
- **Multi-project command center.**
  - What it means: one view for "ten agents across five projects": what is running, what is blocked and what needs you.
  - Builds on: per-repo `.miloops/` folders, aggregated locally rather than on a server.
- **Agent teams and a specialist marketplace.**
  - What it means: roles are the engine. A ticket declares the role it needs (reviewer, QA, security, docs, architect and so on), and MILOOPS routes it to an agent acting in that role. The marketplace is a searchable catalog where users pick specialists and add them to a mission.
  - A specialist is a shareable role file: instructions and a checklist, the ticket types it handles, the checks it requires, and an optional preferred agent or model. Any MCP agent, such as Claude Code or Codex, adopts the role when it claims a matching ticket, so MILOOPS stays agent-agnostic.
  - Local-first: the catalog is a git-based registry (a public repo of role files), not a MILOOPS server. Adding a specialist copies its file into `.miloops/`.
  - Path: built-in roles first, starting with the independent reviewer from the verification plan; then custom roles in the repo; then the shared catalog.
  - Community: anyone can contribute a specialist through a pull request to the public catalog repo. Maintainer review plus automated checks (schema, a required test example, a safety lint) gate each one, and reviewed specialists can carry a "Verified" badge. The catalog page is a static site built from that repo, so there is still no MILOOPS server.
  - Guardrails:
    - Role files are data, never code, and cannot grant permissions.
    - Any check commands a role declares need explicit user approval when the role is added.
    - A specialist is pinned to a version when it is copied into `.miloops/`.
    - Users can report a specialist, and maintainers can remove it.
    - Author and review history are shown for every specialist.
  - Main risk: prompt injection through role instructions. A role's text steers an agent, so treat it as untrusted input in review, in the safety lint and in what MILOOPS lets a role change.
  - Builds on: ticket claims and handoff notes, which become role-to-role handoffs.

## Sequencing

1. **Get the deterministic foundation right.** Lifecycle and state are reliable, and completion is verified, not claimed.
2. **Make the command center genuinely useful** for running real missions day to day.
3. **Then expand** into the directions above.

Do not start step 3 work while step 1 is shaky. A smart feature on top of unreliable state makes the product worse.

## How to use this document

Before you propose or build a feature, check it against this page:

- Does it follow all three principles and the commitments?
- Does it run into any of the non-goals?
- Which step of the sequencing does it belong to, and is that step the current one?

Examples:

- "Auto-merge every PR an agent opens" fails evidence over claims and human leverage. Completion must be verified, and meaningful calls stay with a person.
- "Add a hosted dashboard so teams can share missions" fails local-first. Sharing goes through git or optional tracker sync instead.
- "Use a Claude-only feature to plan missions" fails agent-agnostic unless every supported agent can do the same through MCP.

If a proposal conflicts with this document, change the proposal, or open a discussion to change this document first. Do not quietly work around it.
