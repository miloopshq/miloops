import path from 'node:path';
import {
  ActivityStream,
  describeTrackerEvent,
  LEASE_MINUTES_ENV,
  leaseMs,
  MarkdownAdapter,
  OperationError,
  type Journal,
  type MapSnapshot,
  type SessionHandle,
  type SessionMode,
  type Ticket,
} from '@miloops-hq/core';
import {
  AgentDocWriter,
  journalFile,
  readAgentDocs,
  readCommandCenterLock,
  type VerifyEnv,
} from '@miloops-hq/core/agents';
import { nodeMarkdownFs } from '@miloops-hq/core/node';
import { AgentLeases } from './agentLeases';
import { AgentSessions } from './agentSessions';
import { callsignFamily, freeCallsign } from './callsign';
import type { AgentOptions, AgentTracker } from './types';

/** State of one connected agent shared by its tools: tracker, sessions, the current mission and tickets seen. */
export class AgentContext {
  readonly adapter: AgentTracker;
  readonly activity = new ActivityStream();
  readonly writer: AgentDocWriter;
  readonly sessions: AgentSessions;
  readonly leases: AgentLeases;
  /** Mission history (`.events/`): every transition this agent makes. */
  readonly journal: Journal;
  /** The mission this agent works on. */
  mission?: string;
  decisionSeq = 0;
  /** Every session this connection opened: a reviewer must not be one of the sessions that did the work. */
  readonly sessionIds: string[] = [];
  /** Answers being waited for, by question id. */
  readonly waits = new Map<string, Promise<{ text: string; author: string }>>();
  private callsign?: string;
  private tickets = new Map<string, Ticket>();
  private offTracker: () => void;

  constructor(readonly opts: AgentOptions) {
    this.adapter = opts.tracker ?? new MarkdownAdapter({ ...nodeMarkdownFs(opts.root), watch: undefined }, opts.root);
    this.writer = new AgentDocWriter(opts.root, this.activity, { client: opts.client, pollMs: opts.pollMs });
    this.sessions = new AgentSessions(this.activity, opts.usage, opts.usagePollMs);
    this.journal = journalFile(opts.root);
    this.leases = new AgentLeases(opts.root, opts.leaseMs ?? leaseMs(process.env[LEASE_MINUTES_ENV]));
    this.offTracker = this.adapter.subscribe((e) => {
      const line = describeTrackerEvent(e, (id) => this.tickets.get(id) ?? ({ key: this.keyOf(id) } as Ticket));
      if (line && this.sessions.current) this.activity.push({ ...line, sessionId: this.sessions.current.id });
    });
  }

  get root() {
    return this.opts.root;
  }

  /** Display key of a ticket seen in this process (`#3`, `ENG-3`). */
  keyOf(ticketId: string) {
    return this.tickets.get(ticketId)?.key ?? `#${ticketId}`;
  }

  /** This agent's callsign, picked on first use so the client name is known. */
  async agentId() {
    if (this.callsign) return this.callsign;
    if (this.opts.agent) return (this.callsign = this.opts.agent);
    const family = callsignFamily(this.opts.client?.());
    const taken = new Set(
      (await readAgentDocs(this.root)).filter((d) => d.session.status === 'running').map((d) => d.session.agent),
    );
    return (this.callsign = freeCallsign(family, taken));
  }

  commandCenter() {
    const lock = readCommandCenterLock(this.root);
    return lock
      ? { running: true, url: lock.url }
      : {
          running: false,
          hint: `Run \`npx miloops --dir ${path.relative(process.cwd(), this.root) || '.'}\` in this folder to watch live.`,
        };
  }

  async load(mapId: string) {
    const snap = await this.adapter.loadMap(mapId);
    for (const t of snap.tickets) this.tickets.set(t.id, t);
    return snap;
  }

  /** By id, key (`#3` or `3`) or title; default the current mission, else the most recently active one. */
  async resolveMission(ref?: string): Promise<MapSnapshot> {
    const maps = await this.adapter.listMaps();
    if (!maps.length) throw new OperationError('No missions yet. Start one with start_mission.');
    const want = ref?.trim();
    if (want) {
      const norm = want.replace(/^#/, '').toLowerCase();
      const m = maps.find(
        (x) => x.id === want || x.key.replace(/^#/, '') === norm || x.title.toLowerCase() === want.toLowerCase(),
      );
      if (!m)
        throw new OperationError(
          `Unknown mission "${want}". Missions: ${maps.map((x) => `${x.key} ${x.title}`).join('; ')}`,
        );
      return this.load(m.id);
    }
    if (this.mission && maps.some((m) => m.id === this.mission)) return this.load(this.mission);
    const snaps = await Promise.all(maps.map((m) => this.load(m.id)));
    const activeAt = (s: MapSnapshot) => Math.max(s.map.updatedAt, ...s.tickets.map((t) => t.updatedAt));
    return snaps.sort((a, b) => activeAt(b) - activeAt(a))[0];
  }

  findTicket(snap: MapSnapshot, ref: string) {
    const norm = ref.trim().replace(/^#/, '');
    const t = snap.tickets.find((x) => x.id === norm || x.key.replace(/^#/, '') === norm);
    if (!t) throw new OperationError(`No ticket ${ref} in mission ${snap.map.key}`);
    return t;
  }

  async decisions(mapId: string) {
    return (await this.adapter.listDecisions(mapId)).sort((a, b) => a.decidedAt - b.decidedAt);
  }

  /** Ends the running session and opens a new one. */
  async open(mode: SessionMode, mapId: string, ticketId?: string) {
    this.sessions.end(true);
    const agent = await this.agentId();
    const s = this.sessions.start(agent, mode, mapId, ticketId);
    this.sessionIds.push(s.id);
    return s;
  }

  /** The running chart session of a mission not created yet, or a new one. */
  async chartSession() {
    const cur = this.sessions.running();
    return cur && cur.info.mode === 'chart' && !cur.info.mapId ? cur : await this.open('chart', '');
  }

  /** The running session, or a new one: a work session on the current mission, else a chart session for a mission to come. */
  async ensureSession(): Promise<SessionHandle> {
    const s = this.sessions.running();
    if (s) return s;
    const maps = await this.adapter.listMaps();
    if (!maps.length && !this.mission) return this.open('chart', '');
    const snap = await this.resolveMission();
    this.mission = snap.map.id;
    const w = await this.open('work', snap.map.id);
    w.step(1, 'reading mission + tickets');
    return w;
  }

  /** Renews this agent's claim leases: on every tool call, and while waiting on a human. */
  heartbeat(extra: { ticketId?: string; note?: string; decision?: string } = {}) {
    if (!this.callsign) return;
    const s = this.sessions.running()?.info;
    const lost = this.leases.renew(this.callsign, { ticketId: s?.ticketId, sessionId: s?.id, ...extra });
    const gone = lost.find((h) => h.ticketId === s?.ticketId && h.mapId === s?.mapId);
    if (gone) this.sessions.end(false, `${gone.key} returned to the queue · claim no longer held`);
  }

  /** Write pending session state now, so a tool result never runs ahead of the command center. */
  flush() {
    this.sessions.measureAll();
    this.writer.flush();
  }

  /** Journal options for an operation done by this agent in its running session. */
  actor() {
    return { journal: this.journal, sessionId: this.sessions.running()?.id };
  }

  /** Where this agent's verification runs read the config, keep evidence and run checks. */
  verifyEnv(): VerifyEnv {
    return { adapter: this.adapter, root: this.root, journal: this.journal };
  }

  /** End the running session (agent disconnected) and write final state. */
  close(text: string) {
    this.sessions.stopPolling();
    this.sessions.end(true, text);
    this.sessions.measureAll();
    this.offTracker();
    this.writer.close();
    this.adapter.dispose?.();
  }
}
