import path from 'node:path';
import {
  ActivityStream,
  AGENT_INTEGRATIONS,
  MarkdownAdapter,
  OperationError,
  STEPS,
  allowedTypes,
  attention,
  chartMap,
  chooseNext,
  claim,
  deriveStates,
  describeTrackerEvent,
  promoteToTicket,
  recordDecision,
  release,
  resolve,
  ruleOutOfScope,
  stepTag,
  type DecisionRecord,
  type MapMode,
  type MapSnapshot,
  type NodeState,
  type SessionHandle,
  type SessionMode,
  type Ticket,
  type TicketType,
  type TrackerAdapter,
  type TranscriptEntry,
} from '@miloops-hq/core';
import { AgentDocWriter, readAgentDocs, readCommandCenterLock, writeAgentAnswer } from '@miloops-hq/core/agents';
import { nodeMarkdownFs } from '@miloops-hq/core/node';
import type { UsageMeter } from '../usage/meter';

export { OperationError };

export const OPERATOR = 'operator';

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
  tracker?: TrackerAdapter & { dispose?(): void };
  /** Reads real usage from the agent's local logs; without one (or until it finds a log) the agent's reported numbers count. */
  usage?: Pick<UsageMeter, 'noteCall' | 'measure'>;
  /** How often usage of the running session is re-read. */
  usagePollMs?: number;
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

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** Callsign family for a connected client: `claude-code` → `claude`. */
export function callsignFamily(client?: string) {
  const name = (client ?? '').toLowerCase();
  const known = AGENT_INTEGRATIONS.find((a) => name.includes(a.callsign) || name.includes(a.id));
  if (known) return known.callsign;
  return (
    name
      .split(/[^a-z0-9]+/)
      .find(Boolean)
      ?.slice(0, 12) || 'agent'
  );
}

/**
 * One connected agent (one MCP server process). Every tool maps onto the core
 * operations used by the command center, and every step is reported through an
 * in-process ActivityStream whose sessions are mirrored to the command center.
 */
export class MissionAgent {
  readonly adapter: TrackerAdapter & { dispose?(): void };
  readonly activity = new ActivityStream();
  private writer: AgentDocWriter;
  private callsign?: string;
  private mission?: string;
  private session?: SessionHandle;
  private seq = 0;
  private decisionSeq = 0;
  private transcripts = new Map<string, TranscriptEntry[]>();
  private waits = new Map<string, Promise<{ text: string; author: string }>>();
  private tickets = new Map<string, Ticket>();
  private offTracker: () => void;
  /**
   * Usage window of each session of this process: from the model call that
   * issued the tool call opening it (not before the previous session ended) to
   * its own end. Ended sessions are re-measured too, because the agent may write
   * its log after the call that ended the session.
   */
  private windows = new Map<
    string,
    { s: SessionHandle; from: number; to?: number; openedBy?: string; notBefore?: number }
  >();
  private lastEnd?: number;
  /** Agent's id for the tool call being handled. */
  private currentCall?: string;
  private usagePoll?: ReturnType<typeof setInterval>;

  constructor(private opts: AgentOptions) {
    this.adapter = opts.tracker ?? new MarkdownAdapter({ ...nodeMarkdownFs(opts.root), watch: undefined }, opts.root);
    this.writer = new AgentDocWriter(opts.root, this.activity, { client: opts.client, pollMs: opts.pollMs });
    if (opts.usage) {
      this.usagePoll = setInterval(() => this.measureAll(), opts.usagePollMs ?? 2000);
      this.usagePoll.unref?.();
    }
    this.offTracker = this.adapter.subscribe((e) => {
      const line = describeTrackerEvent(e, (id) => this.tickets.get(id) ?? ({ key: this.keyOf(id) } as Ticket));
      if (line && this.session) this.activity.push({ ...line, sessionId: this.session.id });
    });
  }

  get root() {
    return this.opts.root;
  }

  /** Display key of a ticket seen in this process (`#3`, `ENG-3`). */
  private keyOf(ticketId: string) {
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
    let n = 1;
    while (taken.has(`${family}-${String(n).padStart(2, '0')}`)) n++;
    return (this.callsign = `${family}-${String(n).padStart(2, '0')}`);
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

  // ---------- missions ----------

  private async load(mapId: string) {
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

  private findTicket(snap: MapSnapshot, ref: string) {
    const norm = ref.trim().replace(/^#/, '');
    const t = snap.tickets.find((x) => x.id === norm || x.key.replace(/^#/, '') === norm);
    if (!t) throw new OperationError(`No ticket ${ref} in mission ${snap.map.key}`);
    return t;
  }

  private async decisions(mapId: string) {
    return (await this.adapter.listDecisions(mapId)).sort((a, b) => a.decidedAt - b.decidedAt);
  }

  ticketView(snap: MapSnapshot, t: Ticket, records: DecisionRecord[] = []) {
    const states = deriveStates(snap.tickets, snap.map.mode);
    const byId = new Map(snap.tickets.map((x) => [x.id, x]));
    const att = attention(t);
    return {
      id: t.id,
      key: t.key,
      title: t.title,
      type: t.type,
      attention: att,
      state: states.get(t.id),
      assignee: t.assignee,
      body: t.body,
      blockedBy: t.blockedBy.map((b) => ({
        key: byId.get(b)?.key ?? b,
        title: byId.get(b)?.title,
        state: states.get(b),
      })),
      decisionsFromBlockers: records
        .filter((d) => d.ticketId && t.blockedBy.includes(d.ticketId) && !d.supersededBy)
        .map((d) => ({ id: d.id, ticket: d.ticketKey, decision: d.answer })),
      comments: t.comments.slice(-5).map((c) => ({ author: c.author, body: c.body })),
      howTo:
        att === 'hitl'
          ? 'Needs the human: ask each question with ask_human (it waits for the answer), then close_ticket with the agreed resolution.'
          : t.type === 'execute'
            ? 'Implement the decided work, report_progress as you go, then close_ticket with what changed.'
            : 'Work it out yourself (read code, docs, run experiments), then close_ticket with the decision, rationale and alternatives.',
    };
  }

  async status(missionRef?: string) {
    const maps = await this.adapter.listMaps();
    this.flush();
    const docs = await readAgentDocs(this.root);
    const missions = await Promise.all(
      maps.map(async (m) => {
        const s = await this.load(m.id);
        return {
          id: m.id,
          key: m.key,
          title: m.title,
          decided: s.tickets.filter((t) => t.state === 'closed' && t.closeReason === 'completed').length,
          tickets: s.tickets.length,
        };
      }),
    );
    const base = { agent: await this.agentId(), commandCenter: this.commandCenter(), missions };
    if (!maps.length) return { ...base, mission: null, hint: 'No missions yet. Start one with start_mission.' };
    const snap = await this.resolveMission(missionRef);
    const states = deriveStates(snap.tickets, snap.map.mode);
    const count = (st: NodeState) => snap.tickets.filter((t) => states.get(t.id) === st).length;
    const mine = docs.filter((d) => d.session.mapId === snap.map.id);
    const usage = mine.map((d) => d.session.usage).filter((u) => !!u);
    const records = await this.decisions(snap.map.id);
    return {
      ...base,
      mission: {
        id: snap.map.id,
        key: snap.map.key,
        title: snap.map.title,
        mode: snap.map.mode,
        destination: snap.map.sections.destination,
        progress: `${count('decided')}/${snap.tickets.filter((t) => states.get(t.id) !== 'out-of-scope').length} decided`,
        counts: {
          decided: count('decided'),
          claimed: count('claimed'),
          ready: count('frontier'),
          blocked: count('blocked'),
          parked: count('parked'),
          outOfScope: count('out-of-scope'),
        },
        ready: snap.tickets
          .filter((t) => states.get(t.id) === 'frontier')
          .map((t) => ({ key: t.key, title: t.title, type: t.type, attention: attention(t) })),
        claimed: snap.tickets
          .filter((t) => states.get(t.id) === 'claimed')
          .map((t) => ({ key: t.key, title: t.title, assignee: t.assignee })),
        blocked: snap.tickets
          .filter((t) => states.get(t.id) === 'blocked')
          .map((t) => ({ key: t.key, title: t.title })),
        runningSessions: mine
          .filter((d) => d.session.status === 'running')
          .map((d) => ({
            agent: d.session.agent,
            step: d.session.stepLabel,
            ticket: d.session.ticketId && this.keyOf(d.session.ticketId),
          })),
        waitingOnYou: docs.flatMap((d) => d.pending).filter((q) => q.mapId === snap.map.id).length,
        decisions: records
          .filter((d) => !d.supersededBy)
          .slice(-10)
          .map((d) => ({ id: d.id, ticket: d.ticketKey, summary: d.summary })),
        notYetSpecified: snap.map.sections.unspecified,
        spend: {
          inputTokens: sum(usage.map((u) => u.inputTokens)),
          outputTokens: sum(usage.map((u) => u.outputTokens)),
          costUsd: round(sum(usage.map((u) => u.costUsd))),
          sources: [...new Set(usage.map((u) => u.source ?? 'reported'))],
          note: 'Sessions of the last 24 hours',
        },
      },
    };
  }

  // ---------- sessions ----------

  private async open(mode: SessionMode, mapId: string, ticketId?: string) {
    this.endSession(true);
    const agent = await this.agentId();
    this.session = this.activity.startSession({
      id: `s_${process.pid.toString(36)}_${(this.seq++).toString(36)}`,
      agent,
      mode,
      mapId,
      ticketId,
    });
    this.transcripts.set(this.session.id, []);
    this.windows.set(this.session.id, {
      s: this.session,
      from: this.session.info.startedAt,
      openedBy: this.currentCall,
      notBefore: this.lastEnd,
    });
    return this.session;
  }

  private running() {
    return this.session?.info.status === 'running' ? this.session : undefined;
  }

  /** Set a session's usage from the agent's logs. False when no log is available. */
  private measure(s: SessionHandle) {
    const w = this.windows.get(s.id);
    const u = w && this.opts.usage?.measure(w.from, w.to, { openedBy: w.openedBy, notBefore: w.notBefore });
    if (u) s.setUsage(u);
    return !!u;
  }

  /** Re-measure every session of this process ended in the last hour, and the running one. */
  private measureAll() {
    if (!this.opts.usage) return;
    for (const [id, w] of this.windows) {
      if (w.to && w.to < Date.now() - 3_600_000) this.windows.delete(id);
      else this.measure(w.s);
    }
  }

  private endSession(ok: boolean, text?: string, signal?: boolean) {
    const s = this.running();
    if (s) {
      this.lastEnd = Date.now();
      const w = this.windows.get(s.id);
      if (w) w.to = this.lastEnd;
      this.measure(s);
      s.done(ok, text, { signal });
    }
    this.session = undefined;
  }

  /** `_meta` of an incoming tool call: tells the usage meter which agent log this process belongs to. */
  noteCall(meta: Record<string, unknown> | undefined) {
    this.currentCall = this.opts.usage?.noteCall(meta);
  }

  /** The running session, or a new one: a work session on the current mission, else a chart session for a mission to come. */
  private async ensureSession(): Promise<SessionHandle> {
    const s = this.running();
    if (s) return s;
    const maps = await this.adapter.listMaps();
    if (!maps.length && !this.mission) return this.open('chart', '');
    const snap = await this.resolveMission();
    this.mission = snap.map.id;
    const w = await this.open('work', snap.map.id);
    w.step(1, 'reading mission + tickets');
    return w;
  }

  private note(s: SessionHandle, from: TranscriptEntry['from'], author: string, text: string) {
    this.transcripts.get(s.id)?.push({ from, author, text, at: Date.now() });
  }

  async startMission(input: {
    title: string;
    destination: string;
    notes?: string;
    mode?: MapMode;
    tickets?: TicketPlanInput[];
    decided?: string[];
    unspecified?: string[];
    outOfScope?: string[];
  }) {
    const cur = this.running();
    const s = cur && cur.info.mode === 'chart' && !cur.info.mapId ? cur : await this.open('chart', '');
    s.step(1, input.destination);
    s.step(2, `${input.tickets?.length ?? 0} tickets proposed`);
    for (const t of input.tickets ?? []) s.log(`proposed ${t.type} · ${t.title}`);
    const refs = new Set((input.tickets ?? []).map((t) => t.ref));
    for (const t of input.tickets ?? [])
      for (const b of t.blockedBy ?? [])
        if (!refs.has(b)) throw new OperationError(`ticket "${t.ref}" is blocked by unknown ref "${b}"`);
    s.step(3, input.title);
    const { map, tickets } = await chartMap(
      this.adapter,
      {
        title: input.title,
        mode: input.mode,
        sections: {
          destination: input.destination,
          notes: input.notes ?? '',
          decisions: (input.decided ?? []).map((text) => ({ text })),
          unspecified: input.unspecified ?? [],
          outOfScope: input.outOfScope ?? [],
        },
        tickets: (input.tickets ?? []).map((t) => ({ ...t, body: t.body ?? '' })),
      },
      {
        onMapCreated: (m) => {
          s.bindMap(m.id);
          s.log(`mission ${m.key} online`, 'ok');
          s.step(4, `${input.tickets?.length ?? 0} tickets`);
        },
      },
    );
    this.mission = map.id;
    s.step(5, 'ready for agents');
    const framing = this.transcripts.get(s.id) ?? [];
    this.endSession(true, `Mission launched · ${tickets.length} tickets`, true);
    const snap = await this.load(map.id);
    const next = chooseNext(snap);
    return {
      mission: { id: map.id, key: map.key, title: map.title, mode: map.mode },
      tickets: tickets.map((t) => ({
        ref: (input.tickets ?? []).find((p) => p.title === t.title)?.ref,
        key: t.key,
        title: t.title,
        type: t.type,
      })),
      framingQuestionsAnswered: framing.filter((e) => e.from === 'human').length,
      next: next ? this.ticketView(snap, next) : null,
      commandCenter: this.commandCenter(),
    };
  }

  async resumeMission(missionRef?: string) {
    const snap = await this.resolveMission(missionRef);
    this.mission = snap.map.id;
    const cur = this.running();
    if (!cur || cur.info.mapId !== snap.map.id)
      (await this.open('work', snap.map.id)).step(1, 'reading mission + tickets');
    const status = await this.status(snap.map.id);
    const agent = await this.agentId();
    const mine = snap.tickets.find((t) => t.state === 'open' && t.assignee === agent);
    const next = chooseNext(snap);
    return {
      ...status,
      yourClaim: mine ? this.ticketView(snap, mine, await this.decisions(snap.map.id)) : null,
      next: next ? this.ticketView(snap, next, await this.decisions(snap.map.id)) : null,
    };
  }

  async updateMission(input: {
    mission?: string;
    destination?: string;
    notes?: string;
    addUnspecified?: string[];
    addOutOfScope?: string[];
    mode?: MapMode;
  }) {
    const snap = await this.resolveMission(input.mission);
    const s = await this.ensureSession();
    const sec = snap.map.sections;
    const patch = {
      ...(input.destination !== undefined ? { destination: input.destination } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.addUnspecified?.length
        ? { unspecified: [...sec.unspecified, ...input.addUnspecified.filter((x) => !sec.unspecified.includes(x))] }
        : {}),
      ...(input.addOutOfScope?.length ? { outOfScope: [...sec.outOfScope, ...input.addOutOfScope] } : {}),
    };
    if (Object.keys(patch).length) await this.adapter.updateMapSections(snap.map.id, patch);
    if (input.mode && input.mode !== snap.map.mode) await this.adapter.setMapMode(snap.map.id, input.mode);
    s.log(`mission updated · ${[...Object.keys(patch), ...(input.mode ? ['mode'] : [])].join(', ') || 'no change'}`);
    return (await this.status(snap.map.id)).mission;
  }

  // ---------- tickets ----------

  async nextTicket(input: { mission?: string; types?: TicketType[] } = {}) {
    const snap = await this.resolveMission(input.mission);
    const t = chooseNext(snap, { types: input.types });
    if (t) return { ticket: this.ticketView(snap, t, await this.decisions(snap.map.id)) };
    const states = deriveStates(snap.tickets, snap.map.mode);
    const open = snap.tickets.filter((x) => x.state === 'open');
    const reason = !open.length
      ? 'Every ticket is closed: the mission is decided.'
      : `No ready ticket: ${open.filter((x) => states.get(x.id) === 'claimed').length} claimed, ${open.filter((x) => states.get(x.id) === 'blocked').length} blocked, ${open.filter((x) => states.get(x.id) === 'parked').length} parked.`;
    return { ticket: null, reason };
  }

  async claimTicket(input: { ticket?: string; mission?: string } = {}) {
    const snap = await this.resolveMission(input.mission);
    this.mission = snap.map.id;
    const agent = await this.agentId();
    const target = input.ticket ? this.findTicket(snap, input.ticket) : chooseNext(snap);
    if (!target)
      throw new OperationError((await this.nextTicket({ mission: snap.map.id })).reason ?? 'No ready ticket');
    const t =
      target.assignee === agent && target.state === 'open'
        ? target
        : await claim(this.adapter, snap.map.id, target.id, agent);
    const mode: SessionMode = t.type === 'research' ? 'research' : 'work';
    const cur = this.running();
    let s: SessionHandle;
    if (cur && cur.info.mode === mode && cur.info.mapId === snap.map.id && !cur.info.ticketId) s = cur;
    else {
      s = await this.open(mode, snap.map.id, t.id);
      if (mode === 'work') s.step(1, 'reading mission + tickets');
    }
    const hitl = attention(t) === 'hitl';
    if (mode === 'research') {
      s.step(1, t.key, t.id);
      s.step(2, t.title);
    } else {
      s.step(2, `${t.key} ${t.title}`, t.id);
      s.step(3, `${t.key} ${t.type} · ${hitl ? 'with you' : 'agent only'}`);
    }
    const fresh = await this.load(snap.map.id);
    return {
      claimed: this.ticketView(
        fresh,
        fresh.tickets.find((x) => x.id === t.id)!,
        await this.decisions(snap.map.id),
      ),
      session: this.sessionView(),
    };
  }

  async releaseTicket(input: { ticket?: string; mission?: string; reason?: string }) {
    const snap = await this.resolveMission(input.mission);
    const ref = input.ticket ?? this.running()?.info.ticketId;
    if (!ref) throw new OperationError('Which ticket? Pass `ticket`.');
    const t = this.findTicket(snap, ref);
    if (t.assignee !== (await this.agentId()))
      throw new OperationError(`${t.key} is not claimed by you${t.assignee ? ` (assignee: ${t.assignee})` : ''}`);
    await release(this.adapter, snap.map.id, t.id);
    if (this.running()?.info.ticketId === t.id)
      this.endSession(true, `Released ${t.key}${input.reason ? ` · ${input.reason}` : ''}`);
    return { released: t.key };
  }

  async addTicket(input: {
    mission?: string;
    title: string;
    type: TicketType;
    body?: string;
    hitl?: boolean;
    blockedBy?: string[];
    fromUnspecified?: string;
  }) {
    const snap = await this.resolveMission(input.mission);
    if (!allowedTypes(snap.map.mode).includes(input.type))
      throw new OperationError(`${input.type} tickets are disabled on plan-only missions`);
    const s = await this.ensureSession();
    const blockers = (input.blockedBy ?? []).map((b) => this.findTicket(snap, b).id);
    let t: Ticket;
    if (input.fromUnspecified) {
      t = await promoteToTicket(this.adapter, snap.map.id, input.fromUnspecified, {
        type: input.type,
        hitl: input.hitl,
        title: input.title,
        body: input.body,
        blockedBy: blockers,
      });
      s.log(`promoted to ${t.key} · ${input.fromUnspecified}`, 'ok');
    } else {
      t = await this.adapter.createTicket(snap.map.id, {
        title: input.title,
        type: input.type,
        hitl: input.hitl,
        body: `${input.body ?? ''}\n\nPart of mission ${snap.map.key}.`.trim(),
      });
      for (const b of blockers) await this.adapter.addBlocking(snap.map.id, b, t.id);
    }
    const fresh = await this.load(snap.map.id);
    return {
      ticket: this.ticketView(
        fresh,
        fresh.tickets.find((x) => x.id === t.id)!,
      ),
    };
  }

  async closeTicket(input: {
    ticket?: string;
    mission?: string;
    resolution: string;
    summary?: string;
    rationale?: string;
    alternatives?: string[];
    outcome?: 'completed' | 'out_of_scope';
    postTranscript?: boolean;
  }) {
    const s0 = this.running();
    const snap = await this.resolveMission(input.mission ?? (s0?.info.mapId || undefined));
    const ref = input.ticket ?? (s0?.info.mapId === snap.map.id ? s0.info.ticketId : undefined);
    if (!ref) throw new OperationError('Which ticket? Pass `ticket`, or claim one first.');
    const agent = await this.agentId();
    let t = this.findTicket(snap, ref);
    if (t.state === 'closed') throw new OperationError(`${t.key} is already closed`);
    if (t.assignee && t.assignee !== agent) throw new OperationError(`${t.key} is claimed by ${t.assignee}`);
    if (!t.assignee && input.outcome !== 'out_of_scope') {
      await this.claimTicket({ ticket: t.id, mission: snap.map.id });
      t = (await this.load(snap.map.id)).tickets.find((x) => x.id === t.id)!;
    }
    const s = this.running()?.info.ticketId === t.id ? this.running()! : await this.ensureSession();
    const before = new Set(
      [...deriveStates(snap.tickets, snap.map.mode)].filter(([, v]) => v === 'frontier').map(([k]) => k),
    );
    const source = { kind: 'agent' as const, ref: `${s.id}/${t.id}`, label: `${agent} session` };
    let decision: DecisionRecord | undefined;
    if (input.outcome === 'out_of_scope') {
      await ruleOutOfScope(
        this.adapter,
        snap.map.id,
        { ticketId: t.id },
        { reason: input.resolution, author: agent, source },
      );
      decision = (await this.decisions(snap.map.id)).find((d) => d.ticketId === t.id && d.source.ref === source.ref);
    } else {
      const log = this.transcripts.get(s.id) ?? [];
      const human = log.filter((e) => e.from === 'human');
      if (s.info.mode === 'research') s.step(3, `${t.key} decided`);
      else s.step(4, `${input.postTranscript && log.length ? 'transcript + ' : ''}comment + close + record decision`);
      await resolve(this.adapter, snap.map.id, t.id, {
        answer: input.resolution,
        summary: input.summary,
        author: agent,
        transcript:
          input.postTranscript && log.length ? log.map((e) => `**${e.author}:** ${e.text}`).join('\n\n') : undefined,
        decision: {
          rationale: input.rationale,
          alternatives: input.alternatives,
          decidedBy: human.length ? human[human.length - 1].author : agent,
          participants: [...new Set([agent, ...human.map((e) => e.author)])].map((id) => ({ id })),
          source,
          transcript: log,
        },
      });
      decision = (await this.decisions(snap.map.id)).find((d) => d.source.ref === source.ref);
      if (s.info.mode === 'work') s.step(5);
    }
    const after = await this.load(snap.map.id);
    const states = deriveStates(after.tickets, after.map.mode);
    const unblocked = after.tickets.filter((x) => states.get(x.id) === 'frontier' && !before.has(x.id));
    if (s.info.ticketId === t.id)
      this.endSession(true, `${t.key} ${input.outcome === 'out_of_scope' ? 'ruled out' : 'decided'} · session closed`);
    const next = chooseNext(after);
    const open = after.tickets.filter((x) => x.state === 'open').length;
    return {
      closed: t.key,
      outcome: input.outcome ?? 'completed',
      decision: decision ? { id: decision.id, summary: decision.summary, decidedBy: decision.decidedBy } : null,
      unblocked: unblocked.map((x) => ({ key: x.key, title: x.title, type: x.type })),
      next: next ? { key: next.key, title: next.title, type: next.type, attention: attention(next) } : null,
      missionDone: open === 0,
    };
  }

  // ---------- reporting ----------

  sessionView() {
    const s = this.session?.info;
    if (!s) return null;
    return {
      id: s.id,
      agent: s.agent,
      mode: s.mode,
      step: s.step ? stepTag(s.mode, s.step) : 'BOOT',
      stepLabel: s.stepLabel,
      ticket: s.ticketId && this.keyOf(s.ticketId),
      status: s.status,
      usage: s.usage,
    };
  }

  async report(input: {
    message?: string;
    level?: 'info' | 'ok' | 'warn' | 'alert';
    step?: string | number;
    say?: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  }) {
    const s = await this.ensureSession();
    if (input.step !== undefined) {
      const steps = STEPS[s.info.mode];
      const n =
        typeof input.step === 'number'
          ? input.step
          : steps.findIndex((x) => x.toLowerCase() === String(input.step).toLowerCase()) + 1 || Number(input.step);
      if (!Number.isInteger(n) || n < 1 || n > steps.length)
        throw new OperationError(`step must be 1-${steps.length} or one of: ${steps.join(', ')}`);
      s.step(n, input.message);
    } else if (input.message) s.log(input.message, input.level ?? 'info');
    if (input.say) {
      s.say(input.say);
      this.note(s, 'agent', s.info.agent, input.say);
    }
    const u = {
      inputTokens: Math.max(0, input.inputTokens ?? 0),
      outputTokens: Math.max(0, input.outputTokens ?? 0),
      costUsd: Math.max(0, input.costUsd ?? 0),
    };
    const measured = this.measure(s);
    if (!measured && (u.inputTokens || u.outputTokens || u.costUsd)) s.usage({ ...u, source: 'reported' });
    return {
      session: this.sessionView(),
      usageSource: measured
        ? `${s.info.usage?.source} logs (reported numbers are ignored)`
        : s.info.usage
          ? 'reported'
          : 'none',
    };
  }

  async recordDecision(input: {
    mission?: string;
    ticket?: string;
    question: string;
    answer: string;
    summary?: string;
    rationale?: string;
    alternatives?: string[];
    decidedBy?: string;
    appendToMission?: boolean;
  }) {
    const s = this.running();
    const snap = await this.resolveMission(input.mission ?? (s?.info.mapId || undefined));
    const agent = await this.agentId();
    const t = input.ticket ? this.findTicket(snap, input.ticket) : undefined;
    const rec = await recordDecision(
      this.adapter,
      snap.map.id,
      {
        ticketId: t?.id,
        ticketKey: t?.key,
        question: input.question,
        answer: input.answer,
        summary: input.summary,
        alternatives: input.alternatives,
        rationale: input.rationale,
        decidedBy: input.decidedBy ?? agent,
        participants: [...new Set([agent, input.decidedBy ?? agent])].map((id) => ({ id })),
        source: {
          kind: 'agent',
          ref: `${s?.id ?? `${agent}@${process.pid}`}/d${this.decisionSeq++}`,
          label: `${agent} session`,
        },
      },
      { appendToMission: input.appendToMission },
    );
    return { decision: rec };
  }

  // ---------- HITL ----------

  /** `framing`: the question frames a mission that does not exist yet (`/milo new`), so it belongs to a chart session. */
  async ask(
    input: { question: string; suggestions?: string[]; waitSeconds?: number; framing?: boolean },
    ctl: WaitControl = {},
  ): Promise<AskResult> {
    const cur = this.running();
    const s = input.framing
      ? cur && cur.info.mode === 'chart' && !cur.info.mapId
        ? cur
        : await this.open('chart', '')
      : await this.ensureSession();
    if (input.framing && s.info.step === 0) s.step(1, 'framing interview');
    this.note(s, 'agent', s.info.agent, input.question);
    const answer = s.ask(input.question, input.suggestions?.length ? input.suggestions : undefined);
    const q = this.activity.snapshot.pending.filter((p) => p.sessionId === s.id).at(-1)!;
    this.writer.flush();
    const sid = s.id;
    this.waits.set(
      q.id,
      answer.then((text) => {
        const author =
          [...this.activity.snapshot.chats].reverse().find((c) => c.sessionId === sid && c.from === 'human')?.author ??
          OPERATOR;
        this.transcripts.get(sid)?.push({ from: 'human', author, text, at: Date.now() });
        return { text, author };
      }),
    );
    return this.waitForAnswer({ questionId: q.id, waitSeconds: input.waitSeconds }, ctl);
  }

  async waitForAnswer(input: { questionId: string; waitSeconds?: number }, ctl: WaitControl = {}): Promise<AskResult> {
    const p = this.waits.get(input.questionId);
    if (!p)
      throw new OperationError(
        `Unknown question ${input.questionId} (questions only live as long as the session that asked them)`,
      );
    const started = Date.now();
    const waited = () => Math.round((Date.now() - started) / 1000);
    const limit = Math.max(0, input.waitSeconds ?? this.defaultWaitSeconds()) * 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tick: ReturnType<typeof setInterval> | undefined;
    let onAbort = () => {};
    const res = await Promise.race([
      p.then((a) => ({ answered: true as const, a })),
      new Promise<{ answered: false }>((r) => {
        timer = setTimeout(() => r({ answered: false }), limit);
        onAbort = () => r({ answered: false });
        ctl.signal?.addEventListener('abort', onAbort, { once: true });
        if (ctl.onProgress) tick = setInterval(() => ctl.onProgress!(waited()), 15_000);
      }),
    ]).finally(() => {
      clearTimeout(timer);
      clearInterval(tick);
      ctl.signal?.removeEventListener('abort', onAbort);
    });
    if (!res.answered) return { answered: false, questionId: input.questionId, waitedSeconds: waited() };
    this.waits.delete(input.questionId);
    return {
      answered: true,
      questionId: input.questionId,
      answer: res.a.text,
      answeredBy: res.a.author,
      waitedSeconds: waited(),
    };
  }

  /** Codex cancels MCP calls after 60 s unless `tool_timeout_sec` is raised, so its waits return before that. */
  defaultWaitSeconds() {
    return callsignFamily(this.opts.client?.()) === 'codex' ? 50 : 600;
  }

  /** Open questions from every connected agent on this tracker. */
  async inbox() {
    const docs = await readAgentDocs(this.root);
    const maps = new Map((await this.adapter.listMaps()).map((m) => [m.id, m]));
    return {
      questions: docs
        .flatMap((d) => d.pending.map((q) => ({ q, d })))
        .sort((a, b) => a.q.at - b.q.at)
        .map(({ q, d }) => ({
          questionId: q.id,
          sessionId: q.sessionId,
          agent: q.agent,
          mission: maps.get(q.mapId)?.title ?? (q.mapId ? q.mapId : 'new mission (framing)'),
          ticket: q.ticketId ? this.keyOf(q.ticketId) : undefined,
          question: q.text,
          suggestions: q.suggestions,
          askedSecondsAgo: Math.round((Date.now() - q.at) / 1000),
          step: d.session.stepLabel,
        })),
      commandCenter: this.commandCenter(),
    };
  }

  /** Answer a question from the agent chat, as the operator. Works for any connected agent's question. */
  async answerQuestion(input: { questionId: string; answer: string }) {
    const own = this.activity.snapshot.pending.find((p) => p.id === input.questionId);
    if (own) {
      this.activity.answer(own.id, input.answer.trim(), OPERATOR);
      return { delivered: true, to: own.agent };
    }
    const doc = (await readAgentDocs(this.root)).find((d) => d.pending.some((q) => q.id === input.questionId));
    if (!doc) throw new OperationError(`No open question ${input.questionId}. Call list_inbox for the current ones.`);
    writeAgentAnswer(this.root, {
      sessionId: doc.session.id,
      questionId: input.questionId,
      text: input.answer,
      author: OPERATOR,
    });
    return { delivered: true, to: doc.session.agent };
  }

  /** Write pending session state now, so a tool result never runs ahead of the command center. */
  flush() {
    this.measureAll();
    this.writer.flush();
  }

  /** End the running session (agent disconnected) and write final state. */
  close(text = 'Agent disconnected') {
    clearInterval(this.usagePoll);
    this.endSession(true, text);
    this.measureAll();
    this.offTracker();
    this.writer.close();
    this.adapter.dispose?.();
  }
}
