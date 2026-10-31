import type {
  DecisionInput,
  DecisionRecord,
  MapMode,
  MapSections,
  MapSnapshot,
  MapSummary,
  Ticket,
  TicketType,
  TrackerEvent,
  MapDoc,
} from '../model/types';

/**
 * The tracker is the source of truth. Adapters expose only the primitive
 * operations a real issue tracker supports (issues, labels, assignment,
 * comments, close, blocking relations). Map semantics such as
 * "resolve" or "promote to ticket" are composed from these in `operations.ts`,
 * so every adapter gets them for free.
 *
 * Mapping to real trackers:
 *   map            -> issue labelled MAP_LABEL (brand.ts)
 *   ticket         -> child/sub-issue labelled label(<type>)
 *   claim          -> assignment
 *   blockedBy      -> native "blocked by" relation
 *   out of scope   -> closed as not planned (+ line in the map's Out of scope)
 */
export interface TrackerAdapter {
  readonly kind: 'mock' | 'markdown' | 'github' | 'linear';
  readonly label: string;
  /** Short location string shown in the HUD, e.g. a repo or folder. */
  readonly location: string;

  listMaps(): Promise<MapSummary[]>;
  loadMap(mapId: string): Promise<MapSnapshot>;

  createMap(input: { title: string; sections: MapSections; mode?: MapMode }): Promise<MapDoc>;
  /** Real trackers: add/remove the PLAN_ONLY_LABEL on the map issue. */
  setMapMode(mapId: string, mode: MapMode): Promise<void>;
  /** Rewrites the named sections of the map issue body. */
  updateMapSections(mapId: string, patch: Partial<MapSections>): Promise<void>;

  createTicket(mapId: string, input: { title: string; type: TicketType; body: string; hitl?: boolean }): Promise<Ticket>;
  addBlocking(mapId: string, blockerId: string, blockedId: string): Promise<void>;
  assign(mapId: string, ticketId: string, assignee: string | null): Promise<void>;
  comment(mapId: string, ticketId: string, author: string, body: string): Promise<void>;
  close(mapId: string, ticketId: string, reason: 'completed' | 'not_planned'): Promise<void>;

  /** Decision records of a mission, any order. Real trackers: a comment marker or a linked doc per record. */
  listDecisions(mapId: string): Promise<DecisionRecord[]>;
  /** Persists a record and assigns its `D-<n>` id. Use `recordDecision` (operations.ts), not this directly. */
  createDecision(mapId: string, input: DecisionInput): Promise<DecisionRecord>;
  /** Marks a record as replaced by `supersededBy`. */
  markSuperseded(mapId: string, decisionId: string, supersededBy: string): Promise<void>;

  subscribe(listener: (e: TrackerEvent) => void): () => void;
}

export type AdapterFactory = () => Promise<TrackerAdapter>;
