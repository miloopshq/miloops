import { BRAND } from '@miloops-hq/core';

export const INSTRUCTIONS = `${BRAND.name} is the command center for this repo's missions. A mission is a map of tickets (research, prototype, grilling, task, execute) with blocking edges; the human watches it live in the command center and answers questions there.

Work loop: resume_mission (or start_mission for a new idea) → claim_ticket → do the work, calling report_progress with steps and notes → ask_human whenever you need the human (it waits for the answer) → close_ticket with the resolution → claim the next ticket.
When a ticket lists verification checks, run them yourself before closing: close_ticket runs them too, and the ticket is only done when they pass. On status "rework", fix what feedback shows, claim the ticket again and close it again; on pending=true, call verification_status with wait=true; on "blocked", a human decides, so move on; on "verifying", another agent reviews it, so move on.
A review ticket (type review) asks you to check another agent's finished work: read the change it names, run what you need, then answer with submit_review (PASS, FAIL with findings, or NEEDS_HUMAN). You are never given reviews of your own work.
Use record_decision for any other call worth keeping. Never decide HITL tickets (grilling, prototype, HITL tasks) alone: ask.
If ask_human returns answered=false, call wait_for_answer with the questionId, or tell the user the question is waiting in the command center.`;
