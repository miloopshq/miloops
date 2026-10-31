import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TrackerAdapter } from '../adapters/adapter';
import type { DecisionRecord } from '../model/types';
import type { TrackerRoutesOptions } from './trackerContext';

export interface TrackerBridge {
  root: string;
  /**
   * Handles a request whose URL has already had the API prefix stripped:
   *   GET  /list, GET|PUT /file?path=        raw tracker files (the browser's MarkdownFs)
   *   GET  /events                           SSE: `{ path }` per changed file; named `decision` events (DecisionEvent);
   *                                          named `agent` events (AgentSessionDoc) when an agent session reports
   *   GET  /agents                           `{ sessions: AgentSessionDoc[] }` running and recent agent sessions
   *   POST /agents/answer                    body `{ sessionId, questionId, text, author? }` → AgentAnswer
   *   GET  /agents/leases                    `{ leases: TicketLease[] }` claim leases and recent tombstones; SSE `leases` on change
   *   POST /agents/leases/release            body `{ mapId, ticketId, by? }` → `{ returned }`: back to the queue with a handoff comment
   *   GET  /decisions[?mission=<id>]         `{ decisions: DecisionRecord[] }`
   *   POST /decisions                        body `{ mission, appendToMission?, ...DecisionInput }` → DecisionRecord (idempotent per source.kind + source.ref)
   *   POST /decisions/<id>/supersede         body `{ mission, ...DecisionInput }` → the new DecisionRecord
   *   /trackers*, /tracker/<kind>/*          GitHub / Linear settings and API (trackerRoutes.ts)
   * Decision routes use the project's active tracker (local markdown, GitHub or Linear).
   */
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  close(): void;
}

/** Payload of the SSE `decision` event. */
export interface DecisionEvent {
  kind: 'decision.recorded' | 'decision.superseded' | 'decision.updated';
  mapId: string;
  decision: DecisionRecord;
}

/** What an optional server module (e.g. the Slack connector) gets from the bridge. */
export interface BridgeContext {
  root: string;
  /** The project's active tracker (local markdown, GitHub or Linear). */
  active(): Promise<TrackerAdapter>;
  /** The command center's URL, once it is serving. */
  url(): string | undefined;
}

export interface BridgePlugin {
  /** Return true when the request was handled. The URL has the API prefix stripped. */
  handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean>;
  close(): void;
}

export type BridgePluginFactory = (ctx: BridgeContext) => BridgePlugin;

export interface BridgeOptions extends Omit<TrackerRoutesOptions, 'root' | 'markdown'> {
  plugins?: BridgePluginFactory[];
  url?: () => string | undefined;
  /** How often lease files are polled and expired leases returned to the queue. */
  leases?: { pollMs?: number; reapMs?: number };
}
