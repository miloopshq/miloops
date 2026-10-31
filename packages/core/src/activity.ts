import { BRAND, MAP_LABEL } from './brand';
import { Emitter, uid } from './emitter';
import { STEPS, stepTag } from './steps';
import { SECTION_LABEL } from './mapBody';
import type { UsageLedger } from './presence';
import type { AnsweredQuestion, ChatMessage, FeedEntry, PendingQuestion, SessionInfo, SessionMode, SessionUsage, Ticket, TrackerEvent } from './types';

const addUsage = (a: SessionUsage | undefined, b: SessionUsage): SessionUsage => ({
  inputTokens: (a?.inputTokens ?? 0) + b.inputTokens,
  outputTokens: (a?.outputTokens ?? 0) + b.outputTokens,
  costUsd: (a?.costUsd ?? 0) + b.costUsd,
});

export interface ActivityState {
  sessions: SessionInfo[];
  feed: FeedEntry[];
  chats: ChatMessage[];
  /** Questions agents are blocked on. Non-empty = "waiting on you". */
  pending: PendingQuestion[];
  /** Answered questions with ask/answer times, for HITL response time. */
  answered: AnsweredQuestion[];
  /** Cumulative model usage per map, kept after sessions scroll out of `sessions`. */
  usageByMap: Record<string, SessionUsage>;
}

export interface SessionHandle {
  readonly id: string;
  readonly info: SessionInfo;
  step(n: number, detail?: string, ticketId?: string): void;
  log(text: string, level?: FeedEntry['level']): void;
  /** Post an agent message into the session's conversation. */
  say(text: string): void;
  /** Ask the human a question and wait for the answer. */
  ask(text: string, suggestions?: string[]): Promise<string>;
  done(ok?: boolean, text?: string, opts?: { signal?: boolean }): void;
  /** Attach the session to a map created mid-session (chart). */
  bindMap(mapId: string): void;
  /** Add model usage reported by the agent. */
  usage(delta: SessionUsage): void;
}

/**
 * Stream of agent-session activity (which procedure step each session is on,
 * and HITL conversations) merged with tracker events. Sessions are not tracker
 * state: in a real setup they would be reported by the CLI / MCP server as
 * agents call operations, and answers would be relayed back to the agent.
 */
export class ActivityStream {
  private state: ActivityState = { sessions: [], feed: [], chats: [], pending: [], answered: [], usageByMap: {} };
  private changes = new Emitter<ActivityState>();
  private resolvers = new Map<string, (answer: string) => void>();
  constructor(
    private readonly maxFeed = 400,
    /** Receives every usage report with its time, for spend-since readouts. Settable once storage is known. */
    public ledger?: UsageLedger,
  ) {}

  get snapshot() {
    return this.state;
  }

  subscribe(fn: (s: ActivityState) => void) {
    return this.changes.on(fn);
  }

  private set(patch: Partial<ActivityState>) {
    this.state = { ...this.state, ...patch };
    this.changes.emit(this.state);
  }

  push(e: Omit<FeedEntry, 'id' | 'at'> & { at?: number }) {
    const entry: FeedEntry = { id: uid('f'), at: e.at ?? Date.now(), ...e };
    if (entry.source === 'system' && !entry.agent) entry.agent = BRAND.assistant.name;
    this.set({ feed: [...this.state.feed, entry].slice(-this.maxFeed) });
    return entry;
  }

  private patchSession(id: string, patch: Partial<SessionInfo>) {
    this.set({ sessions: this.state.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  private chat(m: Omit<ChatMessage, 'id' | 'at'>) {
    this.set({ chats: [...this.state.chats, { id: uid('m'), at: Date.now(), ...m }].slice(-600) });
  }

  /** Deliver a human answer to a pending question. */
  answer(questionId: string, text: string, author: string) {
    const q = this.state.pending.find((p) => p.id === questionId);
    const resolveFn = this.resolvers.get(questionId);
    if (!q || !resolveFn) return false;
    this.resolvers.delete(questionId);
    this.chat({ sessionId: q.sessionId, ticketId: q.ticketId, from: 'human', author, text });
    this.set({
      pending: this.state.pending.filter((p) => p.id !== questionId),
      answered: [...this.state.answered, { id: q.id, mapId: q.mapId, sessionId: q.sessionId, agent: q.agent, askedAt: q.at, answeredAt: Date.now() }].slice(-200),
    });
    this.patchSession(q.sessionId, { waitingOn: undefined });
    this.push({ source: 'operator', agent: author, level: 'ok', ticketId: q.ticketId, sessionId: q.sessionId, text: `Answered ${q.agent}` });
    resolveFn(text);
    return true;
  }

  startSession(input: { agent: string; mode: SessionMode; mapId: string; ticketId?: string }): SessionHandle {
    const info: SessionInfo = {
      id: uid('s'),
      ...input,
      step: 0,
      total: STEPS[input.mode].length,
      stepLabel: 'BOOT',
      status: 'running',
      startedAt: Date.now(),
    };
    this.set({ sessions: [...this.state.sessions, info].slice(-24) });
    const self = this;
    const current = () => self.state.sessions.find((s) => s.id === info.id) ?? info;
    this.push({ source: 'session', sessionId: info.id, agent: info.agent, level: 'info', text: `Session opened · ${input.mode}` });
    return {
      id: info.id,
      get info() {
        return current();
      },
      step(n, detail, ticketId) {
        const label = STEPS[input.mode][n - 1];
        self.patchSession(info.id, { step: n, stepLabel: label, ...(ticketId ? { ticketId } : {}) });
        self.push({
          source: 'session',
          sessionId: info.id,
          agent: info.agent,
          tag: stepTag(input.mode, n),
          level: 'step',
          text: detail ? `${label}: ${detail}` : label,
          ticketId: ticketId ?? current().ticketId,
        });
      },
      log(text, level = 'info') {
        self.push({ source: 'session', sessionId: info.id, agent: info.agent, level, text, ticketId: current().ticketId });
      },
      say(text) {
        self.chat({ sessionId: info.id, ticketId: current().ticketId, from: 'agent', author: info.agent, text });
      },
      ask(text, suggestions) {
        const q: PendingQuestion = { id: uid('q'), sessionId: info.id, mapId: info.mapId, ticketId: current().ticketId, agent: info.agent, text, suggestions, at: Date.now() };
        self.chat({ sessionId: info.id, ticketId: q.ticketId, from: 'agent', author: info.agent, text, questionId: q.id });
        self.set({ pending: [...self.state.pending, q] });
        self.patchSession(info.id, { waitingOn: q.id });
        self.push({ source: 'session', sessionId: info.id, agent: info.agent, level: 'alert', ticketId: q.ticketId, text: 'Decision request · waiting on you', signal: true });
        return new Promise<string>((r) => self.resolvers.set(q.id, r));
      },
      done(ok = true, text, opts) {
        self.patchSession(info.id, { status: ok ? 'done' : 'failed', endedAt: Date.now(), waitingOn: undefined });
        const stale = self.state.pending.filter((p) => p.sessionId === info.id);
        if (stale.length) self.set({ pending: self.state.pending.filter((p) => p.sessionId !== info.id) });
        self.push({
          source: 'session',
          sessionId: info.id,
          agent: info.agent,
          level: ok ? 'ok' : 'alert',
          text: text ?? (ok ? 'Session closed' : 'Session aborted'),
          signal: opts?.signal,
        });
      },
      bindMap(mapId) {
        const used = current().usage;
        if (used) {
          self.state = { ...self.state, usageByMap: { ...self.state.usageByMap, [mapId]: addUsage(self.state.usageByMap[mapId], used) } };
          self.ledger?.add(mapId, used, info.id);
        }
        self.patchSession(info.id, { mapId });
      },
      usage(delta) {
        const mapId = current().mapId;
        self.ledger?.add(mapId, delta, info.id);
        self.state = {
          ...self.state,
          usageByMap: { ...self.state.usageByMap, [mapId]: addUsage(self.state.usageByMap[mapId], delta) },
        };
        self.patchSession(info.id, { usage: addUsage(current().usage, delta) });
      },
    };
  }
}

/** Human line for a tracker event; `lookup` resolves ticket ids to keys/titles. */
export function describeTrackerEvent(e: TrackerEvent, lookup: (id: string) => Ticket | undefined): Omit<FeedEntry, 'id' | 'at'> | null {
  const k = (id: string) => lookup(id)?.key ?? id;
  switch (e.kind) {
    case 'map.created':
      return { source: 'tracker', level: 'ok', text: `Mission created · label ${MAP_LABEL}` };
    case 'map.updated':
      return { source: 'tracker', level: 'info', text: `Mission updated${e.section ? ` · ${SECTION_LABEL[e.section].toLowerCase()}` : ''}` };
    case 'map.mode':
      return { source: 'tracker', level: 'warn', text: `Mission mode · ${e.mode}` };
    case 'ticket.created':
      return { source: 'tracker', level: 'info', ticketId: e.ticketId, text: `Opened ${k(e.ticketId)}` };
    case 'ticket.claimed':
      return { source: 'tracker', level: 'warn', ticketId: e.ticketId, text: `Assigned ${k(e.ticketId)} to ${e.assignee}` };
    case 'ticket.released':
      return { source: 'tracker', level: 'info', ticketId: e.ticketId, text: `Unassigned ${k(e.ticketId)}` };
    case 'ticket.closed':
      return {
        source: 'tracker',
        level: e.reason === 'completed' ? 'ok' : 'alert',
        ticketId: e.ticketId,
        text: `Closed ${k(e.ticketId)} · ${e.reason === 'completed' ? 'completed' : 'not planned'}`,
      };
    case 'ticket.commented':
      return { source: 'tracker', level: 'info', ticketId: e.ticketId, text: `Comment on ${k(e.ticketId)}` };
    case 'edge.added':
      return { source: 'tracker', level: 'info', ticketId: e.blockedId, text: `${k(e.blockerId)} blocks ${k(e.blockedId)}` };
    case 'decision.recorded':
      return { source: 'tracker', level: 'ok', ticketId: e.ticketId, text: `Decision ${e.decisionId} recorded${e.ticketId ? ` · ${k(e.ticketId)}` : ''}` };
    case 'decision.superseded':
      return { source: 'tracker', level: 'warn', text: `Decision ${e.decisionId} superseded by ${e.supersededBy}` };
    case 'external.changed':
      return { source: 'tracker', level: 'warn', text: 'External change detected · resynced' };
    default:
      return null;
  }
}
