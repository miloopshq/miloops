import { Emitter, sleep } from '../lib/emitter';
import type { MapMetaPatch, TicketMetaPatch } from '../model/lifecycle';
import {
  DEFAULT_MAP_MODE,
  type DecisionInput,
  type DecisionRecord,
  type MapMode,
  type MapSections,
  type MapSnapshot,
  type Ticket,
  type TicketType,
  type TrackerEvent,
  type MapDoc,
} from '../model/types';
import { buildDecision } from '../planning/decisions/decisionRecord';
import type { MapInput, TrackerAdapter } from './adapter';
import { withMapMeta } from './mapMeta';
import { withMeta } from './ticketMeta';

export interface MemoryAdapterOptions {
  /** Simulated network latency range in ms. */
  latency?: [number, number];
  /** First issue number to hand out. */
  startNumber?: number;
  label?: string;
  location?: string;
}

/**
 * In-memory tracker that behaves like a GitHub-style issue tracker
 * (numbered issues, assignment, comments, blocking). Used by tests.
 */
export class MemoryAdapter implements TrackerAdapter {
  readonly kind = 'mock' as const;
  readonly label: string;
  readonly location: string;
  private maps = new Map<string, MapDoc>();
  private tickets = new Map<string, Ticket[]>();
  private events = new Emitter<TrackerEvent>();
  private decisions = new Map<string, DecisionRecord[]>();
  private nextDecision = 1;
  private next: number;
  /** Mutable so seeding can run through the normal operations without the delay. */
  latency: [number, number];

  constructor(opts: MemoryAdapterOptions = {}) {
    this.latency = opts.latency ?? [40, 160];
    this.next = opts.startNumber ?? 1;
    this.label = opts.label ?? 'Memory';
    this.location = opts.location ?? 'mock://demo';
  }

  private async wait() {
    const [a, b] = this.latency;
    if (b > 0) await sleep(a + Math.random() * (b - a));
  }

  private emit(e: TrackerEvent) {
    this.events.emit(e);
  }

  private ticket(mapId: string, id: string) {
    const t = this.tickets.get(mapId)?.find((x) => x.id === id);
    if (!t) throw new Error(`ticket ${id} not found in ${mapId}`);
    return t;
  }

  private touch(mapId: string, t: Ticket) {
    const list = this.tickets.get(mapId)!;
    const next = { ...t, updatedAt: Date.now() };
    this.tickets.set(
      mapId,
      list.map((x) => (x.id === t.id ? next : x)),
    );
    return next;
  }

  /** Synchronous seeding hook (no events, no latency). */
  seed(snap: MapSnapshot) {
    this.maps.set(snap.map.id, snap.map);
    this.tickets.set(snap.map.id, snap.tickets);
    const nums = [snap.map.key, ...snap.tickets.map((t) => t.key)].map((k) => Number(k.replace(/\D/g, '')) || 0);
    this.next = Math.max(this.next, ...nums) + 1;
  }

  async listMaps() {
    await this.wait();
    return [...this.maps.values()].map((m) => ({ id: m.id, key: m.key, title: m.title }));
  }

  async loadMap(mapId: string): Promise<MapSnapshot> {
    await this.wait();
    const map = this.maps.get(mapId);
    if (!map) throw new Error(`map ${mapId} not found`);
    return structuredClone({ map, tickets: this.tickets.get(mapId) ?? [] });
  }

  async createMap(input: MapInput) {
    await this.wait();
    const n = this.next++;
    const map: MapDoc = {
      id: `map-${n}`,
      key: `#${n}`,
      title: input.title,
      mode: input.mode ?? DEFAULT_MAP_MODE,
      ...(input.verification ? { verification: input.verification } : {}),
      sections: structuredClone(input.sections),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.maps.set(map.id, map);
    this.tickets.set(map.id, []);
    this.emit({ kind: 'map.created', mapId: map.id, at: Date.now() });
    return structuredClone(map);
  }

  async setMapMode(mapId: string, mode: MapMode) {
    await this.wait();
    const m = this.maps.get(mapId)!;
    this.maps.set(mapId, { ...m, mode, updatedAt: Date.now() });
    this.emit({ kind: 'map.mode', mapId, mode, at: Date.now() });
  }

  async setMapMeta(mapId: string, patch: MapMetaPatch) {
    await this.wait();
    this.maps.set(mapId, { ...withMapMeta(this.maps.get(mapId)!, patch), updatedAt: Date.now() });
    this.emit({ kind: 'map.updated', mapId, at: Date.now() });
  }

  async updateMapSections(mapId: string, patch: Partial<MapSections>) {
    await this.wait();
    const m = this.maps.get(mapId)!;
    this.maps.set(mapId, { ...m, sections: { ...m.sections, ...structuredClone(patch) }, updatedAt: Date.now() });
    const section = Object.keys(patch)[0] as keyof MapSections | undefined;
    this.emit({ kind: 'map.updated', mapId, section, at: Date.now() });
  }

  async createTicket(mapId: string, input: { title: string; type: TicketType; body: string; hitl?: boolean }) {
    await this.wait();
    const n = this.next++;
    const t: Ticket = {
      id: `t-${n}`,
      key: `#${n}`,
      ...input,
      state: 'open',
      blockedBy: [],
      comments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.tickets.get(mapId)!.push(t);
    this.emit({ kind: 'ticket.created', mapId, ticketId: t.id, at: Date.now() });
    return structuredClone(t);
  }

  async addBlocking(mapId: string, blockerId: string, blockedId: string) {
    await this.wait();
    const t = this.ticket(mapId, blockedId);
    if (!t.blockedBy.includes(blockerId)) this.touch(mapId, { ...t, blockedBy: [...t.blockedBy, blockerId] });
    this.emit({ kind: 'edge.added', mapId, blockerId, blockedId, at: Date.now() });
  }

  async assign(mapId: string, ticketId: string, assignee: string | null) {
    await this.wait();
    const t = this.ticket(mapId, ticketId);
    this.touch(mapId, { ...t, assignee: assignee ?? undefined });
    this.emit(
      assignee
        ? { kind: 'ticket.claimed', mapId, ticketId, assignee, at: Date.now() }
        : { kind: 'ticket.released', mapId, ticketId, at: Date.now() },
    );
  }

  async comment(mapId: string, ticketId: string, author: string, body: string) {
    await this.wait();
    const t = this.ticket(mapId, ticketId);
    const c = { id: `c-${Date.now().toString(36)}${t.comments.length}`, author, body, createdAt: Date.now() };
    this.touch(mapId, { ...t, comments: [...t.comments, c] });
    this.emit({ kind: 'ticket.commented', mapId, ticketId, at: Date.now() });
  }

  async close(mapId: string, ticketId: string, reason: 'completed' | 'not_planned') {
    await this.wait();
    const t = this.ticket(mapId, ticketId);
    this.touch(mapId, { ...t, state: 'closed', closeReason: reason, closedAt: Date.now() });
    this.emit({ kind: 'ticket.closed', mapId, ticketId, reason, at: Date.now() });
  }

  async setMeta(mapId: string, ticketId: string, patch: TicketMetaPatch) {
    await this.wait();
    this.touch(mapId, withMeta(this.ticket(mapId, ticketId), patch));
    this.emit({ kind: 'ticket.updated', mapId, ticketId, at: Date.now() });
  }

  async listDecisions(mapId: string) {
    await this.wait();
    return structuredClone(this.decisions.get(mapId) ?? []);
  }

  async createDecision(mapId: string, input: DecisionInput) {
    await this.wait();
    const d = buildDecision(`D-${this.nextDecision++}`, mapId, structuredClone(input));
    this.decisions.set(mapId, [...(this.decisions.get(mapId) ?? []), d]);
    this.emit({ kind: 'decision.recorded', mapId, decisionId: d.id, ticketId: d.ticketId, at: Date.now() });
    return structuredClone(d);
  }

  async markSuperseded(mapId: string, decisionId: string, supersededBy: string) {
    await this.wait();
    const list = this.decisions.get(mapId) ?? [];
    if (!list.some((d) => d.id === decisionId)) throw new Error(`decision ${decisionId} not found in ${mapId}`);
    this.decisions.set(
      mapId,
      list.map((d) => (d.id === decisionId ? { ...d, supersededBy } : d)),
    );
    this.emit({ kind: 'decision.superseded', mapId, decisionId, supersededBy, at: Date.now() });
  }

  subscribe(listener: (e: TrackerEvent) => void) {
    return this.events.on(listener);
  }
}
