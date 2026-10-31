import { arr, iso, parseFront, str, time, writeFront, type Front } from './frontmatter';
import type {
  DecisionInput,
  DecisionRecord,
  DecisionSource,
  DecisionSourceKind,
  DecisionStatus,
  MapSnapshot,
  Participant,
  TranscriptEntry,
} from './types';

/** Display names per source kind. A new integration adds its kind to `DecisionSourceKind` and a line here. */
export const DECISION_SOURCES: Record<DecisionSourceKind, { label: string; code: string }> = {
  'command-center': { label: 'Command center', code: 'CMD' },
  agent: { label: 'Agent', code: 'AGT' },
  slack: { label: 'Slack', code: 'SLK' },
  tracker: { label: 'Tracker', code: 'TRK' },
};
export const DECISION_SOURCE_KINDS = Object.keys(DECISION_SOURCES) as DecisionSourceKind[];
const isSourceKind = (v: string): v is DecisionSourceKind => v in DECISION_SOURCES;

export const decisionStatus = (d: Pick<DecisionRecord, 'supersededBy'>): DecisionStatus => (d.supersededBy ? 'superseded' : 'active');

export function firstSentence(s: string) {
  const clean = s.replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(.{20,180}?[.!?])(\s|$)/);
  return m ? m[1] : clean.slice(0, 180);
}

/** Fills defaults; shared by every adapter's `createDecision`. */
export function buildDecision(id: string, mapId: string, input: DecisionInput): DecisionRecord {
  return {
    ...input,
    id,
    mapId,
    decidedAt: input.decidedAt ?? Date.now(),
    summary: input.summary?.trim() || firstSentence(input.answer),
    alternatives: input.alternatives ?? [],
    rationale: input.rationale ?? '',
    participants: input.participants ?? [{ id: input.decidedBy }],
    transcript: input.transcript ?? [],
  };
}

export const decisionNumber = (id: string) => Number(id.replace(/\D/g, '')) || 0;

/** Oldest → newest records linked by `supersedes` / `supersededBy`, containing `id`. */
export function supersessionChain(all: DecisionRecord[], id: string): DecisionRecord[] {
  const byId = new Map(all.map((d) => [d.id, d]));
  const seen = new Set<string>();
  let head = byId.get(id);
  while (head?.supersedes && byId.has(head.supersedes) && !seen.has(head.id)) {
    seen.add(head.id);
    head = byId.get(head.supersedes);
  }
  const chain: DecisionRecord[] = [];
  seen.clear();
  for (let d = head; d && !seen.has(d.id); d = d.supersededBy ? byId.get(d.supersededBy) : undefined) {
    seen.add(d.id);
    chain.push(d);
  }
  return chain;
}

/* ---------- local-markdown file: <mission>/decisions/<id>.md ---------- */

const SECTIONS = ['Question', 'Decision', 'Summary', 'Alternatives', 'Rationale', 'Transcript'] as const;

const participantOut = (p: Participant) => (p.name ? `${p.id}|${p.name}` : p.id);
const participantIn = (s: string): Participant => {
  const i = s.indexOf('|');
  return i < 0 ? { id: s } : { id: s.slice(0, i), name: s.slice(i + 1) };
};

export function serializeDecision(d: DecisionRecord): string {
  const front: Front = {
    id: d.id,
    mission: d.mapId,
    ...(d.ticketId ? { ticket: d.ticketId, ticket_key: d.ticketKey ?? '' } : {}),
    decided_by: d.decidedBy,
    decided_at: iso(d.decidedAt),
    participants: d.participants.map(participantOut),
    source: d.source.kind,
    ...(d.source.ref ? { source_ref: d.source.ref } : {}),
    ...(d.source.url ? { source_url: d.source.url } : {}),
    ...(d.source.label ? { source_label: d.source.label } : {}),
    ...(d.source.meta ? { source_meta: Object.entries(d.source.meta).map(([k, v]) => `${k}=${v}`) } : {}),
    ...(d.supersedes ? { supersedes: d.supersedes } : {}),
    ...(d.supersededBy ? { superseded_by: d.supersededBy } : {}),
  };
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '_None._');
  const transcript = d.transcript.length
    ? d.transcript.map((e) => `### ${e.author} · ${e.from} @ ${iso(e.at)}\n\n${e.text.trim()}`).join('\n\n')
    : '_None._';
  const body = [
    `## Question\n\n${d.question.trim()}`,
    `## Decision\n\n${d.answer.trim()}`,
    `## Summary\n\n${d.summary.trim()}`,
    `## Alternatives\n\n${list(d.alternatives)}`,
    `## Rationale\n\n${d.rationale.trim() || '_None._'}`,
    `## Transcript\n\n${transcript}`,
  ].join('\n\n');
  return writeFront(front, body);
}

export function parseDecision(md: string): DecisionRecord {
  const { front, body } = parseFront(md);
  const sec: Partial<Record<(typeof SECTIONS)[number], string>> = {};
  const re = new RegExp(`^## (${SECTIONS.join('|')})\\s*$`, 'gm');
  const marks = [...body.matchAll(re)];
  marks.forEach((m, i) => {
    const text = body.slice(m.index! + m[0].length, marks[i + 1]?.index ?? body.length).trim();
    sec[m[1] as (typeof SECTIONS)[number]] = /^_none\._$/i.test(text) ? '' : text;
  });
  const transcript: TranscriptEntry[] = (sec.Transcript ?? '')
    .split(/^### /m)
    .slice(1)
    .map((chunk) => {
      const nl = chunk.indexOf('\n');
      const head = nl < 0 ? chunk : chunk.slice(0, nl);
      const [who, at = ''] = head.split(' @ ');
      const [author, from = 'agent'] = who.split(' · ');
      return { author: author.trim(), from: (['agent', 'human', 'system'].includes(from.trim()) ? from.trim() : 'agent') as TranscriptEntry['from'], at: Date.parse(at) || 0, text: nl < 0 ? '' : chunk.slice(nl + 1).trim() };
    });
  const kind = str(front.source);
  const meta = arr(front.source_meta);
  const source: DecisionSource = {
    kind: isSourceKind(kind) ? kind : 'tracker',
    ...(str(front.source_ref) ? { ref: str(front.source_ref) } : {}),
    ...(str(front.source_url) ? { url: str(front.source_url) } : {}),
    ...(str(front.source_label) ? { label: str(front.source_label) } : {}),
    ...(meta.length ? { meta: Object.fromEntries(meta.map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)])) } : {}),
  };
  const answer = sec.Decision ?? '';
  return {
    id: str(front.id),
    mapId: str(front.mission),
    ticketId: str(front.ticket) || undefined,
    ticketKey: str(front.ticket_key) || undefined,
    question: sec.Question ?? '',
    answer,
    summary: sec.Summary || firstSentence(answer),
    alternatives: (sec.Alternatives ?? '').split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- ')).map((l) => l.slice(2)),
    rationale: sec.Rationale ?? '',
    decidedBy: str(front.decided_by),
    decidedAt: time(front.decided_at),
    participants: arr(front.participants).map(participantIn),
    source,
    supersedes: str(front.supersedes) || undefined,
    supersededBy: str(front.superseded_by) || undefined,
    transcript,
  };
}

/* ---------- audit view ---------- */

export interface AuditDecision extends DecisionRecord {
  /** Derived from a closed ticket's resolution comment; not a persisted record. */
  derived?: boolean;
}

/**
 * Persisted records plus one derived `tracker` record for every decided ticket
 * that has none (tickets closed before records existed, or by hand in the tracker).
 */
export function auditDecisions(snap: MapSnapshot, records: DecisionRecord[]): AuditDecision[] {
  const covered = new Set(records.map((r) => r.ticketId).filter(Boolean));
  const derived: AuditDecision[] = snap.tickets
    .filter((t) => t.state === 'closed' && t.closeReason === 'completed' && !covered.has(t.id))
    .map((t) => {
      const c = [...t.comments].reverse().find((x) => x.body.startsWith('**Resolution**'));
      const answer = c ? c.body.replace(/^\*\*Resolution\*\*\s*/, '') : snap.map.sections.decisions.find((d) => d.ticketId === t.id || d.ticketKey === t.key)?.text ?? '';
      const author = c?.author ?? t.assignee ?? 'unknown';
      const posted = t.comments.find((x) => x.body.startsWith('**HITL transcript**'));
      const transcript: TranscriptEntry[] = posted
        ? posted.body
            .replace(/^\*\*HITL transcript\*\*\s*/, '')
            .split(/\n\n(?=\*\*[^*]+:\*\* )/)
            .map((p) => p.match(/^\*\*([^*]+):\*\* ([\s\S]*)$/))
            .filter((m): m is RegExpMatchArray => !!m)
            .map((m) => ({ from: m[1] === author ? 'agent' : 'human', author: m[1], text: m[2].trim(), at: posted.createdAt }))
        : [];
      return {
        id: `T${t.key}`,
        mapId: snap.map.id,
        ticketId: t.id,
        ticketKey: t.key,
        question: t.title,
        answer,
        summary: firstSentence(answer),
        alternatives: [],
        rationale: '',
        decidedBy: author,
        decidedAt: t.closedAt ?? c?.createdAt ?? t.updatedAt,
        participants: [...new Set([author, ...transcript.map((e) => e.author)])].map((id) => ({ id })),
        source: { kind: 'tracker', ref: `${snap.map.id}/tickets/${t.id}`, label: `${t.key} resolution comment` },
        transcript,
        derived: true,
      };
    });
  return [...records, ...derived].sort((a, b) => b.decidedAt - a.decidedAt);
}

export interface DecisionFilter {
  mapId?: string;
  source?: DecisionSourceKind;
  decidedBy?: string;
  status?: DecisionStatus;
  query?: string;
}

export function filterDecisions<T extends DecisionRecord>(all: T[], f: DecisionFilter): T[] {
  const q = f.query?.trim().toLowerCase();
  return all.filter(
    (d) =>
      (!f.mapId || d.mapId === f.mapId) &&
      (!f.source || d.source.kind === f.source) &&
      (!f.decidedBy || d.decidedBy === f.decidedBy) &&
      (!f.status || decisionStatus(d) === f.status) &&
      (!q ||
        [d.id, d.ticketKey, d.question, d.answer, d.summary, d.rationale, d.decidedBy, ...d.alternatives, ...d.transcript.map((e) => e.text)]
          .join('\n')
          .toLowerCase()
          .includes(q)),
  );
}

/** `metrics.decisionStats`: counts behind the Decisions view readouts. */
export function decisionStats(all: DecisionRecord[], now = Date.now()) {
  const bySource = Object.fromEntries(DECISION_SOURCE_KINDS.map((k) => [k, 0])) as Record<DecisionSourceKind, number>;
  let superseded = 0;
  let last24h = 0;
  let human = 0;
  for (const d of all) {
    bySource[d.source.kind]++;
    if (d.supersededBy) superseded++;
    if (now - d.decidedAt < 86_400_000) last24h++;
    if (d.transcript.some((e) => e.from === 'human') || d.source.kind === 'command-center' || d.source.kind === 'slack') human++;
  }
  return { total: all.length, active: all.length - superseded, superseded, last24h, human, bySource };
}

/** Markdown export of an audit list, newest first, grouped per mission. */
export function decisionsToMarkdown(all: DecisionRecord[], missions: Record<string, { key: string; title: string }>, opts: { title?: string; now?: number } = {}) {
  const out = [`# ${opts.title ?? 'Decisions'}`, '', `Exported ${iso(opts.now ?? Date.now())} · ${all.length} decisions`];
  const groups = new Map<string, DecisionRecord[]>();
  for (const d of all) groups.set(d.mapId, [...(groups.get(d.mapId) ?? []), d]);
  for (const [mapId, ds] of groups) {
    const m = missions[mapId];
    out.push('', `## Mission ${m ? `${m.key} ${m.title}` : mapId}`);
    for (const d of ds) {
      const src = DECISION_SOURCES[d.source.kind].label;
      out.push(
        '',
        `### ${d.id}${d.ticketKey ? ` · ${d.ticketKey}` : ''} · ${d.question}`,
        '',
        `- **Status:** ${decisionStatus(d)}${d.supersededBy ? ` (superseded by ${d.supersededBy})` : ''}${d.supersedes ? ` · supersedes ${d.supersedes}` : ''}`,
        `- **Decided by:** ${d.decidedBy} · ${iso(d.decidedAt)}`,
        `- **Source:** ${src}${d.source.url ? ` · [${d.source.label ?? 'link'}](${d.source.url})` : d.source.label ? ` · ${d.source.label}` : ''}`,
        ...(d.participants.length ? [`- **Participants:** ${d.participants.map((p) => p.name ?? p.id).join(', ')}`] : []),
        '',
        `**Decision:** ${d.answer}`,
        ...(d.alternatives.length ? ['', '**Alternatives:**', ...d.alternatives.map((a) => `- ${a}`)] : []),
        ...(d.rationale ? ['', `**Rationale:** ${d.rationale}`] : []),
        ...(d.transcript.length
          ? ['', '<details><summary>Transcript</summary>', '', ...d.transcript.map((e) => `> **${e.author}:** ${e.text.replace(/\n/g, '\n> ')}\n>`), '', '</details>']
          : []),
      );
    }
  }
  return out.join('\n') + '\n';
}
