import { OperationError, type DecisionRecord, type MapSnapshot, type Ticket } from '@miloops-hq/core';
import { AgentContext } from './mission/agentContext';
import { closeTicket } from './mission/closeTicket';
import { answerQuestion, ask, defaultWaitSeconds, inbox, waitForAnswer } from './mission/hitl';
import { resumeMission, startMission, status, updateMission } from './mission/missionOps';
import { recordDecision, report, sessionView } from './mission/reporting';
import { addTicket, claimTicket, nextTicket, releaseTicket } from './mission/ticketOps';
import type { AgentOptions, WaitControl } from './mission/types';
import { ticketView } from './mission/views';

export { OperationError };
export { callsignFamily } from './mission/callsign';
export { OPERATOR, type AgentOptions, type AskResult, type TicketPlanInput, type WaitControl } from './mission/types';

type Input<F extends (ctx: AgentContext, ...args: never[]) => unknown> = Parameters<F>[1];

/**
 * One connected agent (one MCP server process). Every tool maps onto the core
 * operations used by the command center, and every step is reported through an
 * in-process ActivityStream whose sessions are mirrored to the command center.
 */
export class MissionAgent {
  readonly adapter: AgentContext['adapter'];
  readonly activity: AgentContext['activity'];
  private ctx: AgentContext;

  constructor(opts: AgentOptions) {
    this.ctx = new AgentContext(opts);
    this.adapter = this.ctx.adapter;
    this.activity = this.ctx.activity;
  }

  get root() {
    return this.ctx.root;
  }

  /** This agent's callsign, picked on first use so the client name is known. */
  agentId() {
    return this.ctx.agentId();
  }

  commandCenter() {
    return this.ctx.commandCenter();
  }

  /** By id, key (`#3` or `3`) or title; default the current mission, else the most recently active one. */
  resolveMission(ref?: string) {
    return this.ctx.resolveMission(ref);
  }

  ticketView(snap: MapSnapshot, t: Ticket, records: DecisionRecord[] = []) {
    return ticketView(snap, t, records);
  }

  status(missionRef?: string) {
    return status(this.ctx, missionRef);
  }

  /** `_meta` of an incoming tool call: tells the usage meter which agent log this process belongs to. */
  noteCall(meta: Record<string, unknown> | undefined) {
    this.ctx.sessions.noteCall(meta);
  }

  startMission(input: Input<typeof startMission>) {
    return startMission(this.ctx, input);
  }

  resumeMission(missionRef?: string) {
    return resumeMission(this.ctx, missionRef);
  }

  updateMission(input: Input<typeof updateMission>) {
    return updateMission(this.ctx, input);
  }

  nextTicket(input: Input<typeof nextTicket> = {}) {
    return nextTicket(this.ctx, input);
  }

  claimTicket(input: Input<typeof claimTicket> = {}) {
    return claimTicket(this.ctx, input);
  }

  releaseTicket(input: Input<typeof releaseTicket>) {
    return releaseTicket(this.ctx, input);
  }

  addTicket(input: Input<typeof addTicket>) {
    return addTicket(this.ctx, input);
  }

  closeTicket(input: Input<typeof closeTicket>) {
    return closeTicket(this.ctx, input);
  }

  sessionView() {
    return sessionView(this.ctx);
  }

  report(input: Input<typeof report>) {
    return report(this.ctx, input);
  }

  recordDecision(input: Input<typeof recordDecision>) {
    return recordDecision(this.ctx, input);
  }

  /** `framing`: the question frames a mission that does not exist yet (`/milo new`), so it belongs to a chart session. */
  ask(input: Input<typeof ask>, ctl: WaitControl = {}) {
    return ask(this.ctx, input, ctl);
  }

  waitForAnswer(input: Input<typeof waitForAnswer>, ctl: WaitControl = {}) {
    return waitForAnswer(this.ctx, input, ctl);
  }

  /** Codex cancels MCP calls after 60 s unless `tool_timeout_sec` is raised, so its waits return before that. */
  defaultWaitSeconds() {
    return defaultWaitSeconds(this.ctx);
  }

  /** Open questions from every connected agent on this tracker. */
  inbox() {
    return inbox(this.ctx);
  }

  /** Answer a question from the agent chat, as the operator. Works for any connected agent's question. */
  answerQuestion(input: Input<typeof answerQuestion>) {
    return answerQuestion(this.ctx, input);
  }

  /** Renew this agent's claim leases (every tool call is a heartbeat). */
  heartbeat() {
    this.ctx.heartbeat();
  }

  /** Keys of tickets whose lease ran out since the last call. */
  takeLostLeases() {
    return this.ctx.leases.takeLost();
  }

  /** Write pending session state now, so a tool result never runs ahead of the command center. */
  flush() {
    this.ctx.flush();
  }

  /** End the running session (agent disconnected) and write final state. */
  close(text = 'Agent disconnected') {
    this.ctx.close(text);
  }
}
