import type { ActorKind, LifecycleEvent, TicketPhase } from '../../model/lifecycle';

export interface TransitionRule {
  event: LifecycleEvent;
  from: TicketPhase[];
  /** Phases the event may lead to; the caller names one when there are several. */
  to: TicketPhase[];
  actors: ActorKind[];
}

const OPEN: TicketPhase[] = ['backlog', 'ready', 'working', 'verifying', 'rework', 'blocked'];
const PEOPLE: ActorKind[] = ['agent', 'operator'];

/**
 * Every ticket state change MILOOPS makes. `transition()` refuses anything
 * not listed here, so this table is the lifecycle.
 */
export const TRANSITIONS: TransitionRule[] = [
  { event: 'claim', from: ['ready', 'rework'], to: ['working'], actors: PEOPLE },
  { event: 'release', from: ['working'], to: ['ready', 'rework'], actors: PEOPLE },
  { event: 'expire', from: ['working'], to: ['ready', 'rework'], actors: ['engine', 'operator'] },
  /** Decision tickets and verification `off`; backlog and ready too, as resolving always allowed. */
  { event: 'complete', from: ['backlog', 'ready', 'working', 'rework'], to: ['done'], actors: PEOPLE },
  { event: 'submit', from: ['working'], to: ['verifying'], actors: PEOPLE },
  { event: 'checks.pass', from: ['verifying'], to: ['verifying', 'done'], actors: ['engine'] },
  { event: 'checks.fail', from: ['verifying'], to: ['rework', 'blocked'], actors: ['engine'] },
  { event: 'checks.error', from: ['verifying'], to: ['blocked'], actors: ['engine'] },
  { event: 'reverify', from: ['verifying'], to: ['verifying'], actors: ['engine', 'operator'] },
  { event: 'review.pass', from: ['verifying'], to: ['verifying', 'done'], actors: ['engine'] },
  { event: 'review.fail', from: ['verifying'], to: ['rework'], actors: ['engine'] },
  { event: 'review.needs_human', from: ['verifying'], to: ['blocked'], actors: ['engine'] },
  { event: 'approve', from: ['verifying'], to: ['done'], actors: ['operator'] },
  { event: 'reject', from: ['verifying', 'blocked'], to: ['rework'], actors: ['operator'] },
  { event: 'accept', from: ['verifying', 'blocked'], to: ['done'], actors: ['operator'] },
  { event: 'unblock', from: ['blocked'], to: ['ready', 'rework', 'verifying'], actors: ['operator'] },
  /** The engine cancels review tickets whose review no longer applies. */
  { event: 'cancel', from: OPEN, to: ['cancelled'], actors: [...PEOPLE, 'engine'] },
];

export const ruleFor = (event: LifecycleEvent) => TRANSITIONS.find((r) => r.event === event)!;
