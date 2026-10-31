import {
  attention,
  type AuditDecision,
  callsign,
  chooseNext,
  claim,
  type MapMode,
  type MapSnapshot,
  promoteToTicket,
  recordDecision,
  release,
  resolve,
  ruleOutOfScope,
  runChart,
  runWork,
  type ScopeTarget,
  seedSnapshot,
  setMapMode,
  supersedeDecision,
  type TicketType,
} from '@miloops-hq/core';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { OPERATOR, WORK_AGENTS } from './operator';
import type { Runtime } from './runtime';
import type { Selection } from './selection';
import { isRunning } from './sessions';

export interface ActionDeps {
  rt: Runtime;
  /** Logs `label`, runs `fn`, and surfaces a rejection as the error toast. */
  guard: (label: string, fn: () => Promise<unknown>) => Promise<void>;
  setMapId: (id: string | undefined) => void;
  refresh: () => Promise<void>;
  mapIdRef: MutableRefObject<string | undefined>;
  snapRef: MutableRefObject<MapSnapshot | undefined>;
  workN: MutableRefObject<number>;
  setChatSession: Dispatch<SetStateAction<string | undefined>>;
  setSelection: Dispatch<SetStateAction<Selection>>;
  setAutopilot: Dispatch<SetStateAction<boolean>>;
}

/** Operator actions of the command center, built once per runtime by `useCommandCenter`. */
export function createActions({
  rt,
  guard,
  setMapId,
  refresh,
  mapIdRef,
  snapRef,
  workN,
  setChatSession,
  setSelection,
  setAutopilot,
}: ActionDeps) {
  return {
    selectMap: (id: string) => setMapId(id),
    chart: (title: string, destination: string, mode: MapMode, notes?: string) =>
      guard(`New mission · ${title}`, () =>
        runChart(rt.ctx, { title, destination, notes, mode, agent: callsign(1), onMap: (id) => setMapId(id) }),
      ),
    /** Dispatch a session on `ticketId`, or on the next frontier ticket. HITL sessions open in the dock. */
    work: (ticketId?: string) => {
      const id = mapIdRef.current;
      if (!id) return;
      const agent = WORK_AGENTS[workN.current++ % WORK_AGENTS.length];
      const t = ticketId ? snapRef.current?.tickets.find((x) => x.id === ticketId) : chooseNext(snapRef.current!);
      rt.activity.push({
        source: 'operator',
        agent: OPERATOR,
        level: 'warn',
        text: `Dispatched ${agent} · ${t ? `work ${t.key}` : 'work next frontier'}`,
      });
      const off = rt.activity.subscribe((st) => {
        const s = st.sessions.find((x) => x.agent === agent && isRunning(x) && x.ticketId);
        if (s) {
          off();
          if (t && attention(t) === 'hitl') setChatSession(s.id);
        }
      });
      void runWork(rt.ctx, { mapId: id, agent, ticketId: t?.id }).finally(off);
    },
    openChat: (sessionId: string | undefined) => setChatSession(sessionId),
    answer: (questionId: string, text: string) => rt.activity.answer(questionId, text, OPERATOR),
    claim: (ticketId: string) => guard('Claim', () => claim(rt.adapter, mapIdRef.current!, ticketId, OPERATOR)),
    release: (ticketId: string) => guard('Release claim', () => release(rt.adapter, mapIdRef.current!, ticketId)),
    /** An agent's claim back to the queue, with a handoff comment of its notes. */
    releaseLease: (ticketId: string) =>
      guard('Release to queue', () => rt.leases.release(mapIdRef.current!, ticketId, OPERATOR)),
    resolve: (ticketId: string, answer: string, extra: { rationale?: string; alternatives?: string[] } = {}) =>
      guard('Resolve · record answer', async () => {
        const t = snapRef.current?.tickets.find((x) => x.id === ticketId);
        if (t && !t.assignee) await claim(rt.adapter, mapIdRef.current!, ticketId, OPERATOR);
        await resolve(rt.adapter, mapIdRef.current!, ticketId, {
          answer,
          author: OPERATOR,
          decision: { ...extra, source: { kind: 'command-center', label: 'Ticket inspector' } },
        });
      }),
    /** Replace a decision. Derived (tracker-only) entries are persisted first so the chain has both ends. */
    supersede: (d: AuditDecision, input: { answer: string; rationale?: string; alternatives?: string[] }) =>
      guard(`Supersede ${d.id}`, async () => {
        let id = d.id;
        if (d.derived) {
          const { id: _id, mapId: _m, derived: _d, supersededBy: _s, ...rest } = d;
          id = (await recordDecision(rt.adapter, d.mapId, rest, { appendToMission: false })).id;
        }
        await supersedeDecision(rt.adapter, d.mapId, id, {
          ...input,
          decidedBy: OPERATOR,
          participants: [{ id: OPERATOR }],
          source: { kind: 'command-center', label: 'Decisions view' },
        });
      }),
    graduate: (unspecified: string, type: TicketType, title: string, blockedBy: string[], hitl: boolean) =>
      guard(`Promote to ticket · ${unspecified}`, async () => {
        const t = await promoteToTicket(rt.adapter, mapIdRef.current!, unspecified, { type, title, blockedBy, hitl });
        setSelection({ kind: 'ticket', id: t.id });
      }),
    ruleOut: (target: ScopeTarget, reason: string) =>
      guard('Rule out of scope', async () => {
        await ruleOutOfScope(rt.adapter, mapIdRef.current!, target, {
          reason,
          author: OPERATOR,
          source: { kind: 'command-center', label: 'Ticket inspector' },
        });
        setSelection(null);
      }),
    setMode: (mode: MapMode) => guard(`Mission mode · ${mode}`, () => setMapMode(rt.adapter, mapIdRef.current!, mode)),
    loadSample: () =>
      guard('Load sample mission', async () => {
        const m = await seedSnapshot(rt.adapter);
        setMapId(m.id);
        await refresh();
        rt.startDemoScenario(m.id);
      }),
    toggleAutopilot: () => {
      if (rt.autopilot.active) rt.autopilot.stop();
      else rt.autopilot.start();
      setAutopilot(rt.autopilot.active);
      rt.activity.push({
        source: 'system',
        level: 'warn',
        text: rt.autopilot.active ? 'Autopilot on · dispatching AFK tickets' : 'Autopilot off',
      });
    },
  };
}
