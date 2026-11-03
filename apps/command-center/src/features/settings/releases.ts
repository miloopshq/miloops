/** Single source for the in-app Changelog tab. Newest first; move items from `next` into a release when they ship. */
import { OLDER_RELEASES } from './olderReleases';

export interface Release {
  version: string;
  date: string;
  items: string[];
}

export const NEXT: { area: string; items: string[] }[] = [
  { area: 'Agents', items: ['Start agent sessions from the command center', 'Cursor'] },
  { area: 'Packaging', items: ['Publish to npm'] },
];

export const RELEASES: Release[] = [
  {
    version: '0.18.0',
    date: '2026-11-04',
    items: [
      'Acceptance criteria: agents write down what done means before they start (required on missions with a discovery brief). When they finish, each point needs proof: one of your checks, a named test, the pull request, or your sign-off',
      'Work whose criteria lack proof goes back with the reason; points only you can confirm come to your inbox to sign off',
      'Business rules from your project knowledge are suggested as criteria, and the ticket shows any rule no criterion covers yet. Confirm a ticket’s criteria in the inspector',
      'Cross-vendor review: when Claude and Codex agents both run, each reviews the other’s work first',
      'Fix: answers from the command center could hang when too many live updates were open; all updates now share one connection',
    ],
  },
  {
    version: '0.17.0',
    date: '2026-11-03',
    items: [
      'Discovery brief: new missions start with an agent mapping the existing system (files, conventions, data and API impact, risks, assumptions, product context). Implementation tickets wait until you accept the brief or ask for changes, from the banner over the map or the card in Communication',
      'Create mission: start a mission from the New mission dialog without a terminal; any agent picks it up with /milo resume',
      'Knowledge: what agents need to know about your codebase and product (architecture, conventions, gotchas, dead ends, business rules, personas, UX principles, pricing). Agents propose, you confirm, keep as an assumption or retire. Confirmed entries reach agents with every claim, picked for the ticket with the reason, and the inspector shows what an agent gets',
      'Knowledge about specific files is flagged for re-confirmation when those files change',
      'Save decisions, cancelled tickets (as dead ends) and brief sections as knowledge in one click; seed it from a document with miloops knowledge import <file.md>',
    ],
  },
  {
    version: '0.16.0',
    date: '2026-11-03',
    items: [
      'Mission report (Mission plan → Report): tickets done, mission and median ticket lead time, your interventions, rework, review results and cost per verified ticket. Hover any number to see how it is computed; export it as markdown',
      'Agents report the same numbers in one line from the status tool',
      'Agents use missions for big work only, and decide routine calls themselves, keeping each one as a decision record you can review or reverse; they ask you when the call changes product behaviour, data, security, billing, a public API or the schema',
      'Decisions: filter by who made the call, agents on their own or people. The briefing now counts only the calls agents made themselves, not your answers they recorded',
    ],
  },
  {
    version: '0.15.0',
    date: '2026-10-31',
    items: [
      'Verification in the ticket inspector: the level that applies and where it comes from, every attempt newest first with the git evidence (base → head, files changed, flags), its checks, exit codes, durations and the failing output, and the full log on demand',
      'Verifying, Rework and Blocked on the map, in the legend and as status counters on missions that verify completions',
      'Operator calls on a verifying or blocked ticket: Approve, Re-run checks, Send to rework with a note, Accept anyway and Unblock. Overrides need a reason, and each call is kept as a verdict next to the attempts and in the mission history. Approve asks for a re-run when the code changed since the checks passed',
      'Set the verification level of a mission (Settings → Verification) or of one ticket (inspector). Only you can change it; agents cannot',
      'The inspector updates live while checks run',
      'Independent review: at Checks + review, a passing completion gets a review ticket that another agent takes and answers with PASS, FAIL (with findings) or NEEDS_HUMAN. The agent that did the work is never given its own review',
      'Waiting on you lists reviewed work to approve (Checks + review + you) and held tickets, and Slack posts them with Approve and Rework… buttons',
      'Agents can name their pull request in `report_completion` (`pr`); PR and CI tracking then follows that PR first',
    ],
  },
  {
    version: '0.14.0',
    date: '2026-10-31',
    items: [
      'Ticket lifecycle in plain words: Ready, Backlog, Working, Done and Cancelled (with Verifying, Rework and Blocked to come with verification)',
      'Every claim, release, return to queue, resolution and rule-out goes through one lifecycle engine that records who, why and when in `.miloops/.events/<mission>.jsonl` (local history, never committed)',
      'Settings → Verification shows the checks in `.miloops/verification.json`: argv commands with timeouts, run without a shell, secrets kept out of their environment. Read-only',
      'Completion is a claim: on missions started with `verification.json` present, an execute or task ticket is only done once its checks pass. A failed check sends it back for Rework with the failing output (agents see it in close_ticket, next_ticket and claim_ticket, and rework comes first in the queue); after 3 failed attempts, or when the checks cannot run, it waits on you as Blocked',
      'New MCP tools `report_completion` and `verification_status`; missions started before verification, and research, grilling and prototype tickets, close exactly as before',
      'Git evidence, no GitHub needed: each claim records HEAD and the uncommitted state, and each completion lists the files changed since then. It flags no changes, overlap with another active ticket, a branch switch or reset, and edits to `verification.json` (which send the ticket to you as Blocked). A pass on code that changed while its checks ran is re-run',
      'Pull request and CI evidence: with `verification.json` and a GitHub token (Settings, `GITHUB_TOKEN` or `gh auth login`), the command center finds each ticket’s PR (its branch `miloops-<mission>-<ticket>`, a `miloops:<mission>#<ticket>` line in the PR body, or a link you set) and flags mismatches: done with the PR still open, PR merged while the ticket is in progress, PR closed unmerged, required checks failing or unknown, PR head not the verified commit. Flags never change a ticket. A CI chip in the header shows sync health and never shows synced after a failed sync',
    ],
  },
  {
    version: '0.13.0',
    date: '2026-10-31',
    items: [
      'Crash recovery for claims: an agent’s claim is a lease (15 min by default) that every tool call renews, including waits on your answer',
      'When an agent crashes or goes silent, its ticket goes back to the queue on its own, and the activity log says so; the next agent picks it up from next_ticket or claim_ticket',
      'The returned ticket keeps a handoff comment with the previous agent’s progress notes and decisions, so the next agent resumes instead of starting over',
      'Stalled state on the map, in sessions and in the ticket inspector when a lease is about to run out, with a Release to queue action',
      'Works with GitHub and Linear: the return is an ordinary comment + unassign, queued in the offline outbox like any other write',
      'Set the lease with `miloops mcp --lease-minutes <n>` or `MILOOPS_LEASE_MINUTES`',
    ],
  },
  {
    version: '0.12.0',
    date: '2026-10-31',
    items: [
      'Slack: your own MILO app, created from a manifest and connected from your machine over Socket Mode in five guided steps (Settings → Slack or `miloops connect slack`)',
      'Tokens stay in your local credential store next to the GitHub and Linear ones; nothing passes through MILOOPS servers',
      'Agent questions arrive as a Slack DM with answer buttons and a Reply… box; answering there resolves the item in Waiting on you, and answering in the command center closes the DM',
      'Save as decision on any message, or `/milo decide`: the form is prefilled with a summary of the thread, and the decision is recorded with a permalink, resolving the related ticket by default',
      '`/milo status` and `/milo inbox` for the mission at a glance; DMs when a ticket is blocked or a mission is done',
      'Allowed users, notification target and events in Settings → Slack',
      'Slack setup without Paste clicks: press ⌘V / Ctrl+V anywhere, or in Chrome just come back to the tab after copying; pasting the app token opens the install page; MILO recognises you by your git email, so there is nothing to claim in Slack',
    ],
  },
  {
    version: '0.11.0',
    date: '2026-10-31',
    items: [
      'GitHub Issues tracker: missions are labelled issues, tickets are sub-issues, blocking uses native issue dependencies',
      'Linear tracker: missions are labelled issues in a team (optionally one project), tickets are sub-issues, blocking uses "blocks" relations',
      'Two-way sync: tickets, status, claims, comments, blockers and decisions written from MILOOPS land in the tracker; changes made there show up within seconds',
      'Decisions are posted as comments on their ticket and listed in the mission',
      'Connect from Settings with Test connection; GitHub reuses your gh login or GITHUB_TOKEN, Linear takes a personal API key',
      'Tokens stay on your machine: kept by the local server, never sent to the browser or anywhere else',
      'Offline and rate limits: changes queue and send in order when the tracker answers again; the connector shows status, queue and remaining requests',
      'Connected agents (MCP) work on the active tracker: with GitHub or Linear connected, their missions, claims and decisions land there, and their sessions show live in the command center',
    ],
  },
  ...OLDER_RELEASES,
];
