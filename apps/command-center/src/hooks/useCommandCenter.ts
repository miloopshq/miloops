import {
  type MapSummary,
  type MapSnapshot,
  type DecisionRecord,
  type ActivityState,
  type TrackerHealth,
  describeTrackerEvent,
  auditDecisions,
} from '@miloops-hq/core';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createActions, OPERATOR, type Runtime, type Selection, isRunning } from '../lib';
import { useLeases } from './useLeases';

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
  const leases = useLeases(rt);
  useEffect(() => rt.monitor.subscribe(setHealth), [rt]);
  const [selection, setSelection] = useState<Selection>(null);
  const [error, setError] = useState<string>();
  /** Session whose conversation is open in the dock. */
  const [chatSession, setChatSession] = useState<string>();
  const mapIdRef = useRef<string>();
  /** Mission a connected agent just created; shown as soon as the tracker lists it. */
  const followRef = useRef<string>();
  const followed = useRef(new Set<string>());
  const snapRef = useRef<MapSnapshot>();
  snapRef.current = snap;

  const setMapId = useCallback((id: string | undefined) => {
    mapIdRef.current = id;
    setMapIdState(id);
    setSelection(null);
  }, []);

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
            (s) => isRunning(s) && rt.activity.isRemote(s.id) && (!e.mapId || !s.mapId || s.mapId === e.mapId),
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
    const isLive = (id?: string) => rt.activity.snapshot.sessions.some((s) => s.id === id && isRunning(s));
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
    () =>
      createActions({
        rt,
        guard,
        setMapId,
        mapIdRef,
        snapRef,
        setChatSession,
        setSelection,
      }),
    [guard, rt, setMapId],
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
    error,
    chatSession,
    decisions,
    leases,
    loaded,
    actions,
  };
}

export type CommandCenterApi = ReturnType<typeof useCommandCenter>;
