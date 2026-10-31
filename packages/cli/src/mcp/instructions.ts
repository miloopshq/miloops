import { BRAND } from '@miloops-hq/core';

export const INSTRUCTIONS = `${BRAND.name} is the command center for this repo's missions. A mission is a map of tickets (research, prototype, grilling, task, execute) with blocking edges; the human watches it live in the command center and answers questions there.

Work loop: resume_mission (or start_mission for a new idea) → claim_ticket → do the work, calling report_progress with steps and notes → ask_human whenever you need the human (it waits for the answer) → close_ticket with the resolution → claim the next ticket.
Use record_decision for any other call worth keeping. Never decide HITL tickets (grilling, prototype, HITL tasks) alone: ask.
If ask_human returns answered=false, call wait_for_answer with the questionId, or tell the user the question is waiting in the command center.`;
