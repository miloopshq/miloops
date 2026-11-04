import type { ApprovalItem, TrackerAdapter } from '@miloops-hq/core';
import type { WebSocketCtor } from '../socket';

export type Env = Record<string, string | undefined>;
export type Payload = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface SlackServiceOptions {
  /** Tracker folder; agent questions are read from `<root>/.agents`. */
  root: string;
  active: () => Promise<TrackerAdapter>;
  /** Command center URL for "Open in MILOOPS" buttons. */
  url: () => string | undefined;
  configDir: string;
  env?: Env;
  fetch?: typeof fetch;
  WebSocket?: WebSocketCtor;
  /** Slack Web API base; defaults to $MILOOPS_SLACK_API, else https://slack.com/api. */
  apiUrl?: string;
  /** How often to look for new agent questions and mission changes; 0 = only on `tick()` (tests). */
  pollMs?: number;
  /** Mission changes are checked every n-th tick. */
  missionEvery?: number;
  /**
   * At most one notification message per mission per window. Unset: the team's digest cadence (`digestMinutes` in
   * attention.json), re-read on every flush. Tests set it.
   */
  batchMs?: number;
  /** The clock, for tests. */
  now?: () => number;
  /**
   * Post an agent question as its own message only when the attention queue says it interrupts now (at or above the
   * team's threshold, outside this person's focus hours); the rest go into the mission digest. The local server's
   * plugin turns this on; off, every question is posted.
   */
  interruptOnly?: boolean;
  backoffMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
  /** Lock owner id; distinct per service so tests can run several in one process. */
  lockOwner?: string;
  /** The local user's email, matched against the workspace to skip the Home-tab claim. Defaults to `git config user.email`. */
  ownerEmail?: () => string | undefined;
}

/** What the decision modal carries between open, mission change and submit. Thread text is never stored here. */
export interface DecisionMeta {
  /** channel id / name */
  c: string;
  cn?: string;
  /** thread root ts and clicked message ts (shortcut only) */
  t?: string;
  m?: string;
  /** submitting user, workspace */
  u: string;
  w: string;
  /** response_url (slash command) */
  r?: string;
  /** permalink, participants [id, name] */
  l?: string;
  p?: [string, string][];
  /** current mission */
  mid?: string;
}

export interface MissionNotes {
  known: Set<string>;
  blocked: Set<string>;
  closed: Set<string>;
  done: boolean;
}

/** An approval message whose buttons are live. */
export interface PostedApproval {
  channel: string;
  ts: string;
  item: ApprovalItem;
  mission: string;
}

export interface Batch {
  lines: string[];
  lastAt: number;
  root?: { day: string; ts: string };
}
