import type { TrackerAdapter } from '../adapter';
import { BRAND, HITL_LABEL, MAP_LABEL, PLAN_ONLY_LABEL, label } from '../../model/brand';
import { Emitter } from '../../lib/emitter';
import { parseMapBody, serializeMapBody } from '../../model/mapBody';
import { arr, iso, parseFront, str, time, writeFront, type Front } from '../../model/frontmatter';
import { DEFAULT_MAP_MODE } from '../../model/types';
import { buildDecision, decisionNumber, parseDecision, serializeDecision } from '../../planning/decisions';
import type { Comment, DecisionInput, DecisionRecord, MapMode, MapSections, MapSnapshot, Ticket, TicketType, TrackerEvent, MapDoc } from '../../model/types';

/**
 * Minimal filesystem the markdown adapter needs. The command center provides
 * an HTTP-backed implementation via the Vite dev server; a CLI would pass
 * one backed by node:fs.
 */
export interface MarkdownFs {
  /** All `.md` paths under the root, relative and `/`-separated. */
  list(): Promise<string[]>;
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
  /** Optional: notify on external changes so other sessions' edits stream in. */
  watch?(cb: (path: string) => void): () => void;
}

/*
 * Labels mirror the tracker labels (see brand.ts); HITL tasks carry HITL_LABEL.
 * Layout:
 *   <map-slug>/map.md           frontmatter + canonical map body
 *   <map-slug>/tickets/<n>.md   frontmatter + body + "## Comments"
 *   <map-slug>/decisions/D-<n>.md  decision record (decisions.ts)
 */


function parseTicket(md: string): Ticket {
  const { front, body } = parseFront(md);
  const [main, commentsRaw = ''] = body.split(/^## Comments\s*$/m);
  const comments: Comment[] = commentsRaw
    .split(/^### /m)
    .slice(1)
    .map((chunk, i) => {
      const nl = chunk.indexOf('\n');
      const [author, at] = chunk.slice(0, nl).split(' @ ');
      return { id: `c${i}`, author: author.trim(), createdAt: Date.parse(at) || 0, body: chunk.slice(nl + 1).trim() };
    });
  const reason = str(front.close_reason);
  return {
    id: str(front.id),
    key: `#${str(front.id)}`,
    title: str(front.title),
    type: (str(front.type) || 'task') as TicketType,
    hitl: arr(front.labels).includes(HITL_LABEL) || undefined,
    state: str(front.state) === 'closed' ? 'closed' : 'open',
    closeReason: reason === 'completed' || reason === 'not_planned' ? reason : undefined,
    assignee: str(front.assignee) || undefined,
    blockedBy: arr(front.blocked_by),
    body: main.trim(),
    comments,
    createdAt: time(front.created),
    updatedAt: time(front.updated),
    closedAt: time(front.closed) || undefined,
  };
}

function serializeTicket(t: Ticket) {
  const front: Front = {
    id: t.id,
    title: t.title,
    type: t.type,
    labels: [label(t.type), ...(t.type === 'task' && t.hitl ? [HITL_LABEL] : [])],
    state: t.state,
    close_reason: t.closeReason ?? '',
    assignee: t.assignee ?? '',
    blocked_by: t.blockedBy,
    created: iso(t.createdAt),
    updated: iso(t.updatedAt),
    ...(t.closedAt ? { closed: iso(t.closedAt) } : {}),
  };
  const comments = t.comments.length
    ? `\n\n## Comments\n\n${t.comments.map((c) => `### ${c.author} @ ${iso(c.createdAt)}\n\n${c.body}`).join('\n\n')}`
    : '';
  return writeFront(front, t.body + comments);
}

export class MarkdownAdapter implements TrackerAdapter {
  readonly kind = 'markdown' as const;
  readonly label = 'Local markdown';
  private events = new Emitter<TrackerEvent>();
  private selfWrites = new Map<string, number>();

  constructor(
    private fs: MarkdownFs,
    readonly location = `./${BRAND.dataDir}`,
  ) {
    fs.watch?.((path) => {
      const t = this.selfWrites.get(path);
      if (t && Date.now() - t < 1500) return;
      this.queueExternal(path);
    });
  }

  /** Last seen text and supersededBy per decision file, to tell new records from supersessions and drop duplicate watcher hits. */
  private seenDecisions = new Map<string, { text: string; supersededBy?: string }>();
  private pending = new Map<string, { paths: Set<string>; timer: ReturnType<typeof setTimeout> }>();

  /**
   * An external decision write also touches map.md, and watchers fire more than once per write,
   * so changes are batched per mission; a batch with decision files reports as decision events.
   */
  private queueExternal(path: string) {
    const mapId = path.split('/')[0];
    const batch = this.pending.get(mapId) ?? { paths: new Set<string>(), timer: setTimeout(() => void this.flushExternal(mapId), 250) };
    batch.paths.add(path);
    this.pending.set(mapId, batch);
  }

  private async flushExternal(mapId: string) {
    const batch = this.pending.get(mapId);
    this.pending.delete(mapId);
    if (!batch) return;
    const decisionPaths = [...batch.paths].filter((p) => /^[^/]+\/decisions\/[^/]+\.md$/.test(p));
    const events: TrackerEvent[] = [];
    for (const p of decisionPaths) {
      const text = await this.fs.read(p).catch(() => '');
      const prev = this.seenDecisions.get(p);
      if (!text || prev?.text === text) continue;
      const d = parseDecision(text);
      this.seenDecisions.set(p, { text, supersededBy: d.supersededBy });
      if (!prev) events.push({ kind: 'decision.recorded', mapId, decisionId: d.id, ticketId: d.ticketId, external: true, at: Date.now() });
      else if (d.supersededBy && d.supersededBy !== prev.supersededBy)
        events.push({ kind: 'decision.superseded', mapId, decisionId: d.id, supersededBy: d.supersededBy, external: true, at: Date.now() });
    }
    if (!decisionPaths.length) events.push({ kind: 'external.changed', mapId, at: Date.now() });
    else if (!events.length && decisionPaths.length < batch.paths.size) events.push({ kind: 'external.changed', mapId, at: Date.now() });
    // superseded events sort after the record that replaced them
    events.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'decision.recorded' ? -1 : 1));
    for (const e of events) this.events.emit(e);
  }

  private rememberDecision(path: string, text: string, supersededBy?: string) {
    this.seenDecisions.set(path, { text, supersededBy });
  }

  private async put(path: string, text: string) {
    this.selfWrites.set(path, Date.now());
    await this.fs.write(path, text);
  }

  private async readMap(mapId: string): Promise<MapDoc> {
    const { front, body } = parseFront(await this.fs.read(`${mapId}/map.md`));
    return {
      id: mapId,
      key: str(front.key) || mapId,
      title: str(front.title) || mapId,
      mode: str(front.mode) === 'plan-only' || arr(front.labels).includes(PLAN_ONLY_LABEL) ? 'plan-only' : DEFAULT_MAP_MODE,
      sections: parseMapBody(body),
      createdAt: time(front.created),
      updatedAt: time(front.updated),
    };
  }

  private async writeMap(m: MapDoc) {
    await this.put(
      `${m.id}/map.md`,
      writeFront({ key: m.key, title: m.title, mode: m.mode, labels: [MAP_LABEL, ...(m.mode === 'plan-only' ? [PLAN_ONLY_LABEL] : [])], created: iso(m.createdAt), updated: iso(m.updatedAt) }, serializeMapBody(m.sections)),
    );
  }

  private async readTicket(mapId: string, id: string) {
    return parseTicket(await this.fs.read(`${mapId}/tickets/${id}.md`));
  }

  private async writeTicket(mapId: string, t: Ticket) {
    await this.put(`${mapId}/tickets/${t.id}.md`, serializeTicket({ ...t, updatedAt: Date.now() }));
  }

  async listMaps() {
    const files = await this.fs.list();
    const ids = files.filter((f) => /^[^/]+\/map\.md$/.test(f)).map((f) => f.split('/')[0]);
    return Promise.all(ids.map(async (id) => {
      const m = await this.readMap(id);
      return { id, key: m.key, title: m.title };
    }));
  }

  async loadMap(mapId: string): Promise<MapSnapshot> {
    const files = await this.fs.list();
    const map = await this.readMap(mapId);
    const ticketFiles = files.filter((f) => f.startsWith(`${mapId}/tickets/`));
    const tickets = await Promise.all(ticketFiles.map(async (f) => parseTicket(await this.fs.read(f))));
    return { map, tickets: tickets.sort((a, b) => a.createdAt - b.createdAt) };
  }

  private async nextNumber() {
    const files = await this.fs.list();
    const nums = files.filter((f) => !f.includes('/decisions/')).map((f) => Number(f.match(/(\d+)\.md$/)?.[1] ?? 0));
    const keys = await Promise.all(
      files.filter((f) => f.endsWith('/map.md')).map(async (f) => Number(str(parseFront(await this.fs.read(f)).front.key).replace(/\D/g, '')) || 0),
    );
    return Math.max(0, ...nums, ...keys) + 1;
  }

  async createMap(input: { title: string; sections: MapSections; mode?: MapMode }) {
    const n = await this.nextNumber();
    const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `map-${n}`;
    const map: MapDoc = { id: slug, key: `#${n}`, title: input.title, mode: input.mode ?? DEFAULT_MAP_MODE, sections: input.sections, createdAt: Date.now(), updatedAt: Date.now() };
    await this.writeMap(map);
    this.events.emit({ kind: 'map.created', mapId: slug, at: Date.now() });
    return map;
  }

  async setMapMode(mapId: string, mode: MapMode) {
    const m = await this.readMap(mapId);
    await this.writeMap({ ...m, mode, updatedAt: Date.now() });
    this.events.emit({ kind: 'map.mode', mapId, mode, at: Date.now() });
  }

  async updateMapSections(mapId: string, patch: Partial<MapSections>) {
    const m = await this.readMap(mapId);
    await this.writeMap({ ...m, sections: { ...m.sections, ...patch }, updatedAt: Date.now() });
    this.events.emit({ kind: 'map.updated', mapId, section: Object.keys(patch)[0] as keyof MapSections, at: Date.now() });
  }

  async createTicket(mapId: string, input: { title: string; type: TicketType; body: string; hitl?: boolean }) {
    const n = await this.nextNumber();
    const t: Ticket = { id: String(n), key: `#${n}`, ...input, state: 'open', blockedBy: [], comments: [], createdAt: Date.now(), updatedAt: Date.now() };
    await this.writeTicket(mapId, t);
    this.events.emit({ kind: 'ticket.created', mapId, ticketId: t.id, at: Date.now() });
    return t;
  }

  async addBlocking(mapId: string, blockerId: string, blockedId: string) {
    const t = await this.readTicket(mapId, blockedId);
    if (!t.blockedBy.includes(blockerId)) await this.writeTicket(mapId, { ...t, blockedBy: [...t.blockedBy, blockerId] });
    this.events.emit({ kind: 'edge.added', mapId, blockerId, blockedId, at: Date.now() });
  }

  async assign(mapId: string, ticketId: string, assignee: string | null) {
    const t = await this.readTicket(mapId, ticketId);
    await this.writeTicket(mapId, { ...t, assignee: assignee ?? undefined });
    this.events.emit(
      assignee ? { kind: 'ticket.claimed', mapId, ticketId, assignee, at: Date.now() } : { kind: 'ticket.released', mapId, ticketId, at: Date.now() },
    );
  }

  async comment(mapId: string, ticketId: string, author: string, body: string) {
    const t = await this.readTicket(mapId, ticketId);
    await this.writeTicket(mapId, { ...t, comments: [...t.comments, { id: `c${t.comments.length}`, author, body, createdAt: Date.now() }] });
    this.events.emit({ kind: 'ticket.commented', mapId, ticketId, at: Date.now() });
  }

  async close(mapId: string, ticketId: string, reason: 'completed' | 'not_planned') {
    const t = await this.readTicket(mapId, ticketId);
    await this.writeTicket(mapId, { ...t, state: 'closed', closeReason: reason, closedAt: Date.now() });
    this.events.emit({ kind: 'ticket.closed', mapId, ticketId, reason, at: Date.now() });
  }

  async listDecisions(mapId: string): Promise<DecisionRecord[]> {
    const files = (await this.fs.list()).filter((f) => f.startsWith(`${mapId}/decisions/`));
    return Promise.all(
      files.map(async (f) => {
        const text = await this.fs.read(f);
        const d = { ...parseDecision(text), mapId };
        if (!this.seenDecisions.has(f)) this.rememberDecision(f, text, d.supersededBy);
        return d;
      }),
    );
  }

  async createDecision(mapId: string, input: DecisionInput) {
    const files = (await this.fs.list()).filter((f) => f.includes('/decisions/'));
    const n = Math.max(0, ...files.map((f) => decisionNumber(f.split('/').pop()!))) + 1;
    const d = buildDecision(`D-${n}`, mapId, input);
    const text = serializeDecision(d);
    this.rememberDecision(`${mapId}/decisions/${d.id}.md`, text);
    await this.put(`${mapId}/decisions/${d.id}.md`, text);
    this.events.emit({ kind: 'decision.recorded', mapId, decisionId: d.id, ticketId: d.ticketId, at: Date.now() });
    return d;
  }

  async markSuperseded(mapId: string, decisionId: string, supersededBy: string) {
    const path = `${mapId}/decisions/${decisionId}.md`;
    const d = parseDecision(await this.fs.read(path));
    const text = serializeDecision({ ...d, mapId, supersededBy });
    this.rememberDecision(path, text, supersededBy);
    await this.put(path, text);
    this.events.emit({ kind: 'decision.superseded', mapId, decisionId, supersededBy, at: Date.now() });
  }

  subscribe(listener: (e: TrackerEvent) => void) {
    return this.events.on(listener);
  }
}
