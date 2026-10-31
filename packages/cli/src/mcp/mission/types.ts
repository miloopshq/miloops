import type { TicketType, TrackerAdapter } from '@miloops-hq/core';
import type { UsageMeter } from '../../usage/meter';

export const OPERATOR = 'operator';

export type AgentTracker = TrackerAdapter & { dispose?(): void };

export interface AgentOptions {
  /** Tracker folder (absolute). */
  root: string;
  /** Fixed callsign, e.g. `claude-07`. Default: picked from the client name. */
  agent?: string;
  /** Connected client, e.g. `claude-code 2.1.0`; read lazily because MCP only knows it after initialize. */
  client?: () => string | undefined;
  /** Poll interval for answers written by the command center. */
  pollMs?: number;
  /** Tracker the missions live in (the project's active tracker). Default: local markdown in `root`. */
  tracker?: AgentTracker;
  /** Reads real usage from the agent's local logs; without one (or until it finds a log) the agent's reported numbers count. */
  usage?: Pick<UsageMeter, 'noteCall' | 'measure'>;
  /** How often usage of the running session is re-read. */
  usagePollMs?: number;
  /** Lease length of a claim; renewed by every tool call. Default: $MILOOPS_LEASE_MINUTES, else 15 min. */
  leaseMs?: number;
}

export interface TicketPlanInput {
  ref: string;
  title: string;
  type: TicketType;
  body?: string;
  hitl?: boolean;
  blockedBy?: string[];
}

export interface AskResult {
  answered: boolean;
  questionId: string;
  answer?: string;
  answeredBy?: string;
  waitedSeconds: number;
}

export interface WaitControl {
  signal?: AbortSignal;
  /** Called about every 15 s while waiting, so clients that reset timeouts on progress keep the call open. */
  onProgress?: (waitedSeconds: number) => void;
}
