import type { TicketStatus, VerificationLevel } from './lifecycle';

/**
 * `execute` tickets carry out decided work (implementation) rather than decide something.
 * `review` tickets are created by MILOOPS when a verified completion needs another agent's review.
 */
export type TicketType = 'research' | 'prototype' | 'grilling' | 'task' | 'execute' | 'review';

/** The types a mission is planned with; `review` tickets are never planned or added by hand. */
export const TICKET_TYPES: TicketType[] = ['research', 'prototype', 'grilling', 'task', 'execute'];

export const ALL_TICKET_TYPES: TicketType[] = [...TICKET_TYPES, 'review'];

export interface Comment {
  id: string;
  author: string;
  body: string;
  createdAt: number;
  /** Remote trackers: id of the MILOOPS write that posted it. */
  writeId?: string;
}

/** A child issue of a map, as the tracker stores it. */
export interface Ticket {
  id: string;
  /** Human key shown in the UI, e.g. "#142" or "WAY-12". */
  key: string;
  title: string;
  type: TicketType;
  /**
   * Only meaningful for `task` and `execute`: true when it needs a human (HITL label).
   * Grilling and prototype are always HITL; research is always AFK.
   */
  hitl?: boolean;
  body: string;
  state: 'open' | 'closed';
  /** `not_planned` is how a ticket is ruled out of scope. */
  closeReason?: 'completed' | 'not_planned';
  assignee?: string;
  /** Lifecycle status on top of open + assignee (model/lifecycle.ts); only `transition()` sets it. */
  status?: TicketStatus;
  /** Overrides the mission's verification level for this ticket. */
  verification?: VerificationLevel;
  /** Check names (verification.json) this ticket runs instead of the config's `run` list. */
  checks?: string[];
  /** `review` tickets: id of the ticket under review. */
  reviewOf?: string;
  /** Ids of tickets that block this one (native blocking edges). */
  blockedBy: string[];
  comments: Comment[];
  createdAt: number;
  updatedAt: number;
  /** When the ticket was closed (decided or ruled out). */
  closedAt?: number;
}

export interface Decision {
  ticketId?: string;
  ticketKey?: string;
  text: string;
}

/** The sections of the single map issue body (labelled MAP_LABEL). */
export interface MapSections {
  destination: string;
  notes: string;
  decisions: Decision[];
  unspecified: string[];
  outOfScope: string[];
}

/**
 * `plan+execute` (default): the map may carry execute tickets that carry out decisions.
 * `plan-only`: the map only decides; execute tickets cannot be added and existing ones are parked.
 */
export type MapMode = 'plan+execute' | 'plan-only';
export const DEFAULT_MAP_MODE: MapMode = 'plan+execute';

export interface MapDoc {
  id: string;
  key: string;
  title: string;
  mode: MapMode;
  /** Unset means off: missions that predate verification complete as they always have. */
  verification?: VerificationLevel;
  sections: MapSections;
  createdAt: number;
  updatedAt: number;
}

export interface MapSnapshot {
  map: MapDoc;
  tickets: Ticket[];
}

export interface MapSummary {
  id: string;
  key: string;
  title: string;
}

/**
 * Where a decision was made. Integrations add a kind here and a label in
 * `DECISION_SOURCES` (decisions.ts); everything else (storage, API, audit view,
 * filters, export) keys off the string, so a new source needs no other change.
 */
export type DecisionSourceKind = 'command-center' | 'agent' | 'slack' | 'tracker';

export interface DecisionSource {
  kind: DecisionSourceKind;
  /** Stable id inside the source: a session id, a Slack `channel/ts`, a tracker file or issue. Used to dedupe imports. */
  ref?: string;
  /** Permalink back to where the decision was made, when the source has one. */
  url?: string;
  /** Human label for the link, e.g. `#mobile-sync` or `claude-07 session`. */
  label?: string;
  /** Source-specific ids kept verbatim, e.g. Slack `workspaceId`, `channelId`, `channelName`, `threadTs`, `messageTs`. */
  meta?: Record<string, string>;
}

/**
 * Actor ids are plain strings namespaced by where the actor lives:
 * `operator` (command center), agent callsigns (`claude-07`), `slack:U123`.
 */
export interface Participant {
  id: string;
  name?: string;
}

export interface TranscriptEntry {
  from: 'agent' | 'human' | 'system';
  /** Actor id. */
  author: string;
  text: string;
  at: number;
}

/** One audited decision. Persisted next to the mission (`<mission>/decisions/<id>.md` in local markdown). */
export interface DecisionRecord {
  /** `D-<n>`, unique per tracker. */
  id: string;
  /** Mission (map) the decision belongs to. */
  mapId: string;
  ticketId?: string;
  ticketKey?: string;
  question: string;
  /** The decision, in full. */
  answer: string;
  /** One line for the mission's Decisions section and list rows. */
  summary: string;
  alternatives: string[];
  rationale: string;
  /** Actor id of who made the call: the operator for HITL answers, the agent callsign for AFK resolutions, `slack:U123`. */
  decidedBy: string;
  decidedAt: number;
  /** Everyone who took part (HITL agent + operator, Slack thread authors). */
  participants: Participant[];
  source: DecisionSource;
  /** Id of the record this one replaces. */
  supersedes?: string;
  /** Id of the record that replaced this one; set means the decision is no longer in force. */
  supersededBy?: string;
  /** The conversation behind the decision: a HITL session, or a Slack thread excerpt. Empty when only a summary was kept. */
  transcript: TranscriptEntry[];
}

export type DecisionStatus = 'active' | 'superseded';

type DecisionDefaults = 'decidedAt' | 'summary' | 'alternatives' | 'rationale' | 'participants' | 'transcript';
export type DecisionInput = Omit<DecisionRecord, 'id' | 'mapId' | 'supersededBy' | DecisionDefaults> &
  Partial<Pick<DecisionRecord, DecisionDefaults>>;

export type TrackerEvent =
  | { kind: 'map.created'; mapId: string; at: number }
  | { kind: 'map.updated'; mapId: string; section?: keyof MapSections; at: number }
  | { kind: 'map.mode'; mapId: string; mode: MapMode; at: number }
  | { kind: 'ticket.created'; mapId: string; ticketId: string; at: number }
  | { kind: 'ticket.updated'; mapId: string; ticketId: string; at: number }
  | { kind: 'ticket.claimed'; mapId: string; ticketId: string; assignee: string; at: number }
  | { kind: 'ticket.released'; mapId: string; ticketId: string; at: number }
  | { kind: 'ticket.closed'; mapId: string; ticketId: string; reason: 'completed' | 'not_planned'; at: number }
  | { kind: 'ticket.commented'; mapId: string; ticketId: string; at: number }
  | { kind: 'edge.added'; mapId: string; blockerId: string; blockedId: string; at: number }
  /** `external`: written by another process (API, agent, integration) and picked up by the watcher. */
  | { kind: 'decision.recorded'; mapId: string; decisionId: string; ticketId?: string; external?: boolean; at: number }
  | {
      kind: 'decision.superseded';
      mapId: string;
      decisionId: string;
      supersededBy: string;
      external?: boolean;
      at: number;
    }
  | { kind: 'external.changed'; mapId?: string; at: number };

/**
 * Derived state of a ticket, one step finer than its `TicketPhase`: `blocked`
 * and `parked` are both backlog, `held` is the phase `blocked` (waiting on a human).
 */
export type NodeState =
  'decided' | 'claimed' | 'frontier' | 'blocked' | 'parked' | 'out-of-scope' | 'verifying' | 'rework' | 'held';

export type SessionMode = 'chart' | 'work' | 'research';

export interface SessionInfo {
  id: string;
  agent: string;
  mode: SessionMode;
  mapId: string;
  ticketId?: string;
  step: number;
  total: number;
  stepLabel: string;
  status: 'running' | 'done' | 'failed';
  /** Set while the session is blocked on a human answer. */
  waitingOn?: string;
  startedAt: number;
  endedAt?: number;
  /** Cumulative model usage: read from the agent's local logs, else as reported by the agent. */
  usage?: SessionUsage;
}

/**
 * Where a session's usage comes from: `claude-code` (Claude Code transcript),
 * `codex` (Codex rollout log), or `reported` (the agent's own report_progress numbers).
 */
export type UsageSource = 'claude-code' | 'codex' | 'reported';

export interface SessionUsage {
  /** Input tokens, cache reads and writes included. */
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Of `inputTokens`, served from the prompt cache. */
  cachedInputTokens?: number;
  source?: UsageSource;
  /** Model ids seen, for log sources. */
  models?: string[];
}

export interface AnsweredQuestion {
  id: string;
  mapId: string;
  sessionId: string;
  agent: string;
  askedAt: number;
  answeredAt: number;
}

export interface FeedEntry {
  id: string;
  at: number;
  source: 'session' | 'tracker' | 'operator' | 'system';
  sessionId?: string;
  agent?: string;
  /** e.g. "WORK 2/5" */
  tag?: string;
  text: string;
  level: 'info' | 'step' | 'ok' | 'warn' | 'alert';
  ticketId?: string;
  /** Rare, high-signal moments (a decision request arriving, a mission launch); rendered in the dot-matrix face. */
  signal?: boolean;
}

/** Who a ticket needs: a human in the loop, or an agent away from keyboard. */
export type Attention = 'hitl' | 'afk';

export interface ChatMessage {
  id: string;
  sessionId: string;
  ticketId?: string;
  from: 'agent' | 'human';
  author: string;
  text: string;
  at: number;
  /** Set on agent questions; the question is open until answered. */
  questionId?: string;
}

export interface PendingQuestion {
  id: string;
  sessionId: string;
  mapId: string;
  ticketId?: string;
  agent: string;
  text: string;
  /** Suggested replies, shown as one-click answers. */
  suggestions?: string[];
  at: number;
  /** How much the agent needs the answer (attention ranking); missing means `soon`. */
  urgency?: 'blocking' | 'soon' | 'fyi';
  /** Ids of tickets that can't move until this is answered. */
  blocks?: string[];
}
