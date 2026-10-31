import {
  ActivityStream,
  BRAND,
  callsign,
  runWork,
  Autopilot,
  MarkdownAdapter,
  MemoryAdapter,
  demoSnapshot,
  seedDecisions,
  seedUsage,
  memoryStore,
  Presence,
  UsageLedger,
  PREFS_KEY,
  type KeyValueStore,
  monitorTracker,
  simulatedBrain,
  type AgentSessionDoc,
  type MarkdownFs,
  type ProcedureContext,
  type TrackerAdapter,
} from '@miloops-hq/core';
import { currentPrefs, loadPrefs, type TrackerChoice } from './prefs';

/** File API served by the Vite dev server (see plugins/trackerFs.ts). */
export const httpFs: MarkdownFs = {
  async list() {
    const r = await fetch(`${BRAND.apiPrefix}/list`);
    return (await r.json()).files as string[];
  },
  async read(path) {
    const r = await fetch(`${BRAND.apiPrefix}/file?path=${encodeURIComponent(path)}`);
    if (!r.ok) throw new Error(`read ${path}: ${r.status}`);
    return r.text();
  },
  async write(path, text) {
    const r = await fetch(`${BRAND.apiPrefix}/file?path=${encodeURIComponent(path)}`, { method: 'PUT', body: text });
    if (!r.ok) throw new Error(`write ${path}: ${r.status}`);
  },
  watch(cb) {
    const es = new EventSource(`${BRAND.apiPrefix}/events`);
    es.onmessage = (m) => cb(JSON.parse(m.data).path);
    return () => es.close();
  },
};

/** Mirror agent sessions reported over MCP (see core agentLink.ts) and send operator answers back to them. */
function linkAgents(activity: ActivityStream) {
  activity.remoteAnswer = (q, text, author) => {
    void fetch(`${BRAND.apiPrefix}/agents/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: q.sessionId, questionId: q.id, text, author }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
      })
      .catch((e: Error) => activity.push({ source: 'system', level: 'alert', sessionId: q.sessionId, text: `Answer not delivered to ${q.agent} · ${e.message}` }));
  };
  const es = new EventSource(`${BRAND.apiPrefix}/events`);
  es.addEventListener('agent', (m) => activity.syncRemote(JSON.parse((m as MessageEvent<string>).data) as AgentSessionDoc));
  void fetch(`${BRAND.apiPrefix}/agents`)
    .then((r) => (r.ok ? (r.json() as Promise<{ sessions: AgentSessionDoc[] }>) : { sessions: [] }))
    .then(({ sessions }) => [...sessions].reverse().forEach((d) => activity.syncRemote(d)))
    .catch(() => {});
}

export type TrackerKind = TrackerChoice;

/** localStorage, namespaced per tracker so each repo keeps its own presence and usage history. */
function localStore(scope: string): KeyValueStore {
  const k = (key: string) => `${PREFS_KEY}:${scope}:${key}`;
  return {
    get: (key) => localStorage.getItem(k(key)),
    set: (key, v) => {
      try {
        localStorage.setItem(k(key), v);
      } catch {
        // storage full or blocked: presence is best effort
      }
    },
  };
}

const HOUR = 3_600_000;

/** `?tracker=demo|markdown` overrides the saved preference (handy for demos and tests). */
export function trackerKind(): TrackerKind {
  const q = new URLSearchParams(location.search).get('tracker');
  return q === 'demo' || q === 'markdown' ? q : loadPrefs().tracker;
}

export function createRuntime(kind: TrackerKind) {
  let raw: TrackerAdapter;
  let ready: Promise<unknown>;
  const activity = new ActivityStream();
  const store: { presence?: Presence } = {};
  if (kind === 'markdown') {
    raw = new MarkdownAdapter(httpFs, `./${BRAND.dataDir}`);
    ready = fetch(`${BRAND.apiPrefix}/list`)
      .then((r) => r.json() as Promise<{ root: string }>)
      .catch(() => ({ root: 'default' }))
      .then(({ root }) => {
        const kv = localStore(root);
        store.presence = new Presence(kv);
        activity.ledger = new UsageLedger(kv);
        linkAgents(activity);
      });
  } else {
    const mem = new MemoryAdapter({ label: 'Demo tracker', location: 'in-memory · resets on reload' });
    const demo = demoSnapshot();
    mem.seed(demo);
    const latency = mem.latency;
    mem.latency = [0, 0];
    const kv = memoryStore();
    const ledger = new UsageLedger(kv);
    seedUsage(ledger, demo);
    activity.ledger = ledger;
    // The demo operator was last here 14 hours ago.
    store.presence = new Presence(kv);
    store.presence.markSeen([demo.map.id], Date.now() - 14 * HOUR);
    ready = seedDecisions(mem, demo.map.id, demo).finally(() => (mem.latency = latency));
    raw = mem;
  }
  /** Every read/write goes through the monitor so sync status and latency are measured, not invented. */
  const monitor = monitorTracker(raw);
  const adapter = monitor.adapter;
  const pace = Number(new URLSearchParams(location.search).get('pace') ?? 1) || 1;
  const ctx: ProcedureContext = { adapter, activity, brain: simulatedBrain(), pace, operator: 'operator', hitlTranscript: () => currentPrefs().hitlTranscript };
  let currentMap: string | undefined;
  const autopilot = new Autopilot(ctx, () => currentMap, { maxParallel: 2, interval: 4200 * pace });
  return {
    kind,
    /** Resolves once storage is scoped to the tracker and demo data is seeded. */
    ready,
    /** Last seen per mission; set once `ready` resolves. */
    get presence() {
      return store.presence;
    },
    adapter,
    monitor,
    activity,
    ctx,
    autopilot,
    setCurrentMap(id: string | undefined) {
      currentMap = id;
    },
    /** Sample map only: a parallel HITL session that is already waiting on the operator. */
    startDemoScenario(mapId: string) {
      setTimeout(async () => {
        if (currentMap !== mapId) return;
        const snap = await adapter.loadMap(mapId);
        const t = snap.tickets.find((x) => x.state === 'open' && !x.assignee && x.type === 'grilling' && x.blockedBy.every((b) => snap.tickets.find((y) => y.id === b)?.state === 'closed'));
        if (t) void runWork(ctx, { mapId, agent: callsign(7), ticketId: t.id });
      }, 2500 * pace);
    },
  };
}

export type Runtime = ReturnType<typeof createRuntime>;
