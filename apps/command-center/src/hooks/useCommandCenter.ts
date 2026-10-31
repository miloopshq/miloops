import {
  callsign,
  type MapSummary,
  type MapSnapshot,
  type DecisionRecord,
  type ActivityState,
  type TrackerHealth,
  describeTrackerEvent,
  type MapMode,
  runChart,
  chooseNext,
  attention,
  runWork,
  claim,
  release,
  resolve,
  type AuditDecision,
  recordDecision,
  supersedeDecision,
  type TicketType,
  promoteToTicket,
  type ScopeTarget,
  ruleOutOfScope,
  setMapMode,
  seedSnapshot,
  auditDecisions,
} from '@miloops-hq/core';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Runtime } from '../lib';

export const OPERATOR = 'operator';

export const WORK_AGENTS = [33, 8, 27, 41].map((n) => callsign(n));

export type Selection = { kind: 'ticket'; id: string } | { kind: 'unspecified'; item: string } | null;

export function useCommandCenter(rt: Runtime) {
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [mapId, setMapIdState] = useState<string>();
  const [snap, setSnap] = useState<MapSnapshot>();
  /** Every mission, for the switcher and the cross-mission inbox. */
  const [allSnaps, setAllSnaps] = useState<Record<string, MapSnapshot>>({});
  /** Persisted decision records per mission. */
  const [records, setRecords] = useState<Record<string, DecisionRecord[]>>({});
  /** True after the first full read of the tracker. */
  const [loaded, setLoaded] = useState(false);
  const [activity, setActivity] = useState<ActivityState>(rt.activity.snapshot);
  const [health, setHealth] = useState<TrackerHealth>(rt.monitor.health);
  useEffect(() => rt.monitor.subscribe(setHealth), [rt]);
  const [selection, setSelection] = useState<Selection>(null);
  const [autopilot, setAutopilot] = useState(false);
  const [error, setError] = useState<string>();
  /** Session whose conversation is open in the dock. */
  const [chatSession, setChatSession] = useState<string>();
  const mapIdRef = useRef<string>();
  /** Mission a connected agent just created; shown as soon as the tracker lists it. */
  const followRef = useRef<string>();
  const followed = useRef(new Set<string>());
  const snapRef = useRef<MapSnapshot>();
  snapRef.current = snap;
  const workN = useRef(0);

  const setMapId = useCallback(
    (id: string | undefined) => {
      mapIdRef.current = id;
      rt.setCurrentMap(id);
      setMapIdState(id);
      setSelection(null);
    },
    [rt],
  );

  const refresh = useCallback(async () => {
    const list = await rt.adapter.listMaps();
    setMaps(list);
    let id = mapIdRef.current;
    const follow = followRef.current;
    if (follow && list.some((m) => m.id === follow)) {
      followRef.current = undefined;
      id = follow;
      if (id !== mapIdRef.current) setMapId(id);
    } else if (!id || !list.some((m) => m.id === id)) {
      id = list[0]?.id;
      setMapId(id);
    }
    const [snaps, recs] = await Promise.all([
      Promise.all(list.map((m) => rt.adapter.loadMap(m.id))),
      Promise.all(list.map((m) => rt.adapter.listDecisions(m.id))),
    ]);
    setAllSnaps(Object.fromEntries(snaps.map((s) => [s.map.id, s])));
    setRecords(Object.fromEntries(list.map((m, i) => [m.id, recs[i]])));
    setLoaded(true);
    setSnap(snaps.find((s) => s.map.id === id));
  }, [rt, setMapId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let offT = () => {};
    let offA = () => {};
    let alive = true;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh().catch((e) => setError(String(e))), 40);
    };
    void rt.ready.then(() => {
      if (!alive) return;
      offT = rt.adapter.subscribe((e) => {
        const line = describeTrackerEvent(e, (id) => snapRef.current?.tickets.find((t) => t.id === id));
        // Writes by a connected agent are already described in its own session feed.
        const byAgent =
          e.kind === 'external.changed' &&
          rt.activity.snapshot.sessions.some(
            (s) =>
              s.status === 'running' && rt.activity.isRemote(s.id) && (!e.mapId || !s.mapId || s.mapId === e.mapId),
          );
        if (
          line &&
          !byAgent &&
          (!('mapId' in e) || !e.mapId || e.mapId === mapIdRef.current || e.kind === 'map.created')
        )
          rt.activity.push(line);
        schedule();
      });
      offA = rt.activity.subscribe(setActivity);
      rt.activity.push({
        source: 'system',
        level: 'ok',
        text: `Online · tracker ${rt.adapter.label.toLowerCase()} · ${rt.adapter.location}`,
      });
      void refresh().catch((e) => setError(String(e)));
      if (rt.kind === 'demo') rt.startDemoScenario('map-142');
    });
    return () => {
      alive = false;
      offT();
      offA();
      clearTimeout(timer);
    };
  }, [rt, refresh]);

  useEffect(() => {
    if (mapId) void rt.adapter.loadMap(mapId).then(setSnap);
  }, [mapId, rt]);

  // A connected agent that charts a new mission brings the command center along.
  useEffect(() => {
    for (const s of activity.sessions) {
      if (s.mode !== 'chart' || !s.mapId || !rt.activity.isRemote(s.id) || followed.current.has(s.id)) continue;
      followed.current.add(s.id);
      if (s.status !== 'running' && Date.now() - (s.endedAt ?? 0) > 60_000) continue;
      followRef.current = s.mapId;
      void refresh().catch((e) => setError(String(e)));
    }
  }, [activity.sessions, rt, refresh]);

  // Never make the operator go looking: surface the oldest open question.
  const firstPending = activity.pending[0]?.sessionId;
  useEffect(() => {
    if (!firstPending) return;
    const isLive = (id?: string) => rt.activity.snapshot.sessions.some((s) => s.id === id && s.status === 'running');
    setChatSession((cur) => (isLive(cur) ? cur : firstPending));
  }, [firstPending, rt]);

  const guard = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      rt.activity.push({ source: 'operator', agent: OPERATOR, level: 'warn', text: label });
      try {
        setError(undefined);
        await fn();
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        setError(msg);
        rt.activity.push({ source: 'operator', agent: OPERATOR, level: 'alert', text: `Rejected · ${msg}` });
      }
    },
    [rt],
  );

  const actions = useMemo(
    () => ({
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
          const s = st.sessions.find((x) => x.agent === agent && x.status === 'running' && x.ticketId);
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
      setMode: (mode: MapMode) =>
        guard(`Mission mode · ${mode}`, () => setMapMode(rt.adapter, mapIdRef.current!, mode)),
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
    }),
    [guard, rt, setMapId, refresh],
  );

  /** Every mission's decisions, newest first, including derived entries for decided tickets without a record. */
  const decisions = useMemo(
    () =>
      Object.values(allSnaps)
        .flatMap((s) => auditDecisions(s, records[s.map.id] ?? []))
        .sort((a, b) => b.decidedAt - a.decidedAt),
    [allSnaps, records],
  );

  return {
    maps,
    allSnaps,
    mapId,
    snap,
    activity,
    health,
    selection,
    setSelection,
    autopilot,
    error,
    chatSession,
    decisions,
    loaded,
    actions,
  };
}

export type CommandCenterApi = ReturnType<typeof useCommandCenter>;
