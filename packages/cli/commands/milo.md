---
description: MILOOPS missions: new, resume, status, inbox
argument-hint: new "<idea>" | resume [mission] | status | inbox
---

You are connected to MILOOPS, this repo's mission command center, through the `miloops` MCP server. The human watches every step live in the command center and answers your questions there.

Arguments: $ARGUMENTS

Take the subcommand from the first word of the arguments. With no arguments, run `status`.

## new "<idea>"

0. Check that it's mission-sized. Missions are for work that spans several layers or needs investigation. For a bug fix, a UI tweak or a single endpoint, say so and do the work directly, without a mission, unless the human asks for one.
1. Frame the idea with the human before planning. Ask 3–4 framing questions, one at a time, each with the `ask_human` tool (`framing: true`, 2–3 short `suggestions`):
   - who it is for,
   - what "done" looks like,
   - what is out of scope,
   - what is already decided.

   Each question also appears in the command center inbox, and the human can answer in either place. If they interrupt the wait and answer here in chat, call `list_inbox`, then `answer_question` with their exact words so the command center shows the answer too.
2. Look around the repo as much as you need, then draft the mission map:
   - `destination`: what "done" looks like, in one or two sentences.
   - `decided`, `unspecified` (known unknowns) and `outOfScope`, from the answers.
   - `tickets`: `research` for what you can find out alone, `grilling` for decisions the human must make, `prototype` for things to try before deciding, `task` for checks and chores (`hitl: true` if the human must do or approve them), `execute` for implementation once its decisions are made. Wire `blockedBy` by ref so every ticket waits for the decisions it depends on.
3. Call `start_mission`. It adds a discovery ticket: implementation waits until the human accepts your discovery brief. Pass `discovery: false` only if the human says to skip it. Tell the human the mission key.
4. Do discovery: claim the discovery ticket, investigate the existing system (and ask the human what the repo can't tell you about the product), then call `submit_brief` with real paths, never guesses. The human reviews it in the command center; `get_brief` shows the status and any requested changes. Once it's accepted, revise the planned tickets if the brief changed the picture (`add_ticket`, `update_mission`).
5. Continue with **resume**.

## resume [mission]

1. Call `resume_mission` (pass the mission if one was named). If `discovery` says the brief isn't accepted yet, do discovery first (see **new**, step 4). If it returns `yourClaim`, continue that ticket; otherwise call `claim_ticket`.
2. Work the ticket:
   - Follow its `howTo`. Never decide a `hitl` ticket alone: ask each question with `ask_human`, wait for the answer, and confirm the drafted resolution with the human before closing.
   - Read the `knowledge` that came with the claim: confirmed entries are binding, assumptions are unverified, and `mayBeOutdated` means the code changed since it was confirmed. If an entry contradicts what you find, `flag_knowledge` with the evidence. When you learn something the next agent needs, `propose_knowledge`; dead ends (what failed and why) are especially worth keeping.
   - Call `report_progress` at each step (`step` plus a short `message`), and for notable findings. Usage is read from your session log; if `report_progress` returns `usageSource: "none"` or `"reported"`, include `inputTokens`, `outputTokens` and `costUsd` only when you actually know them; never guess.
   - Ask or decide. Ask with `ask_human` only when the call changes product behaviour, data, security, billing, a public API or the schema, or when you're genuinely blocked. Keep each question to one decision with 2–3 `suggestions`. Otherwise decide yourself, following the project's conventions, and keep the decision with `record_decision` (`rationale` and `alternatives`): the human sees it in the briefing as decided by an agent and can reverse it.
   - When you ask, set `urgency` honestly: `blocking` only when you can do no useful work until it's answered; `soon` (the default) or `fyi` when you can keep going, and then keep working on other tickets while it waits (short `waitSeconds`). Ask related questions together, and pass `blocks` with the tickets that can't move until it's answered.
   - Before working on a task, execute or prototype ticket, agree what done means: call `set_criteria` (cover the business rules in `criteria.suggested`). When completing, give evidence per criterion in `criteria`: `check:<name>`, `test:<name>`, `command:<cmd>`, `pr`, or `manual` when only the human can confirm it.
   - If the ticket lists `verification.checks`, run those commands yourself before completing. If it has `rework`, a previous completion failed: fix what `rework.failures` shows first.
3. Call `close_ticket` with the full `resolution`, a one-line `summary`, the `rationale` and the `alternatives` you considered. When the ticket needs verification, its checks run first and the result has a `status`:
   - `done`: closed, carry on.
   - `rework`: read `feedback` (the failing checks and their output), fix the cause, `claim_ticket` it again and close it again.
   - `verifying` with `pending: true`: the checks are still running; call `verification_status` with `wait: true`.
   - `blocked`: the human decides in the command center; move on to another ticket.
4. Claim the next ready ticket and repeat until none is ready, the mission is done, or the human asks you to stop. Then give a short summary: what you closed, what is waiting on the human, what is blocked.

If `ask_human` returns `answered: false`, call `wait_for_answer` with its `questionId`. If you have other useful work in the meantime, tell the human the question is waiting in the command center.

## status

Call `status` and summarize it in a few lines: progress, running sessions, what is waiting on the human (`attention`: how many items, how many interrupt, the top ones), what is blocked, what is verifying or back for rework, and spend.

## inbox

Call `list_inbox`. List its `attention` items in their ranked order, each with a number, what it is, its mission and ticket, and its `reasons`; keep items with the same `batch` together. For questions (`questionId`), let the human answer here, then pass their exact words to `answer_question`. Other items (approvals, held tickets, flags, briefs, knowledge) are decided in the command center: say where. Never answer or approve on their behalf.
