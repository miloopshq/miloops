import { useEffect, useMemo, useState } from 'react';
import {
  BRAND,
  DECISION_SOURCE_KINDS,
  DECISION_SOURCES,
  decisionStats,
  decisionStatus,
  decisionsToMarkdown,
  filterDecisions,
  supersessionChain,
  type AuditDecision,
  type DecisionFilter,
  type DecisionSourceKind,
  type DecisionStatus,
  type MapSnapshot,
} from '@miloops-hq/core';
import type { CommandCenterApi } from '../useCommandCenter';
import { Empty, ago, type Breakpoint } from './Hud';

const day = (n: number) => new Date(n).toISOString().slice(0, 10);
const hm = (n: number) => new Date(n).toTimeString().slice(0, 5);
const stamp = (n: number) => `${day(n)} ${hm(n)}`;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Decisions audit: every decision across missions, newest first. Covers the
 * zones under the header without moving them; the header stays in place.
 */
export function DecisionsView(props: {
  api: CommandCenterApi;
  bp: Breakpoint;
  focus?: string;
  onClose: () => void;
  onOpenTicket: (mapId: string, ticketId: string) => void;
}) {
  const { api, bp } = props;
  const all = api.decisions;
  const [filter, setFilter] = useState<DecisionFilter>({});
  const [sel, setSel] = useState<string | undefined>(props.focus);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => setSel(props.focus), [props.focus]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && (bp === 'mobile' && sel ? setSel(undefined) : props.onClose());
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [bp, sel, props]);

  const rows = useMemo(() => filterDecisions(all, filter), [all, filter]);
  const stats = useMemo(() => decisionStats(all), [all]);
  const current = all.find((d) => d.id === sel && (!filter.mapId || d.mapId === filter.mapId)) ?? (bp === 'mobile' ? undefined : rows[0]);
  const missions = useMemo(() => Object.values(api.allSnaps).sort((a, b) => b.map.createdAt - a.map.createdAt), [api.allSnaps]);
  const people = useMemo(() => [...new Set(all.map((d) => d.decidedBy))].sort(), [all]);
  const set = (patch: Partial<DecisionFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const exportMd = () => {
    const ms = Object.fromEntries(missions.map((s) => [s.map.id, { key: s.map.key, title: s.map.title }]));
    download(`${BRAND.slug}-decisions-${day(Date.now())}.md`, decisionsToMarkdown(rows, ms, { title: `${BRAND.name} decisions` }));
  };
  const active = Object.values(filter).filter(Boolean).length;
  const detailOnly = bp === 'mobile' && !!current;

  return (
    <section className={`zone decisions-view dv-${bp}`}>
      <header className="dv-head">
        {detailOnly ? (
          <button className="back" onClick={() => setSel(undefined)}>
            ‹ Decisions
          </button>
        ) : (
          <h2 className="chip-label">
            Decisions <span className="n">{rows.length === all.length ? all.length : `${rows.length}/${all.length}`}</span>
          </h2>
        )}
        {bp !== 'mobile' && <Readouts stats={stats} />}
        <span className="dv-head-right">
          {!detailOnly && (
            <button className="btn" onClick={exportMd} disabled={!rows.length} title="Export the filtered list as markdown">
              Export .md
            </button>
          )}
          <button className="x" onClick={props.onClose} aria-label="Close">
            ×
          </button>
        </span>
      </header>

      {!detailOnly && (
        <div className="dv-search">
          <input type="search" placeholder="Search decisions" value={filter.query ?? ''} onChange={(e) => set({ query: e.target.value })} />
          {bp !== 'wide' && (
            <button className={`chip ${filtersOpen || active > (filter.query ? 1 : 0) ? 'on' : ''}`} onClick={() => setFiltersOpen((o) => !o)}>
              Filters{active - (filter.query ? 1 : 0) > 0 ? ` · ${active - (filter.query ? 1 : 0)}` : ''}
            </button>
          )}
        </div>
      )}

      <div className="dv-body">
        {(bp === 'wide' || (filtersOpen && !detailOnly)) && (
          <Filters filter={filter} set={set} all={all} missions={missions} people={people} compact={bp !== 'wide'} />
        )}
        {!detailOnly && (
          <ol className="dv-list" aria-label="Decisions">
            {rows.length ? (
              rows.map((d, i) => (
                <Row
                  key={`${d.mapId}:${d.id}`}
                  d={d}
                  newDay={i === 0 || day(rows[i - 1].decidedAt) !== day(d.decidedAt)}
                  mission={api.allSnaps[d.mapId]?.map.key}
                  on={current?.id === d.id && current.mapId === d.mapId}
                  showMission={bp === 'wide'}
                  onClick={() => setSel(d.id)}
                />
              ))
            ) : (
              <Empty>No decisions</Empty>
            )}
          </ol>
        )}
        {bp !== 'mobile' || current ? (
          <div className="dv-detail">
            {current ? (
              <Detail d={current} all={all} snap={api.allSnaps[current.mapId]} onSelect={setSel} onOpenTicket={props.onOpenTicket} onSupersede={api.actions.supersede} />
            ) : (
              <Empty>No decision selected</Empty>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** `metrics.decisionStats` readouts. */
function Readouts({ stats }: { stats: ReturnType<typeof decisionStats> }) {
  return (
    <span className="dv-readouts">
      <span className="readout">
        <span className="mono-label">Active</span>
        <b>{stats.active}</b>
      </span>
      <span className="readout">
        <span className="mono-label">Superseded</span>
        <b>{stats.superseded}</b>
      </span>
      <span className="readout">
        <span className="mono-label">Last 24h</span>
        <b>{stats.last24h}</b>
      </span>
      <span className="readout">
        <span className="mono-label">Human</span>
        <b>{stats.total ? Math.round((stats.human / stats.total) * 100) : 0}%</b>
      </span>
      <span className="dv-src-mix" title="Decisions per source">
        {DECISION_SOURCE_KINDS.filter((k) => stats.bySource[k]).map((k) => (
          <span key={k} className={`src-tag src-${k}`}>
            {DECISION_SOURCES[k].code} {stats.bySource[k]}
          </span>
        ))}
      </span>
    </span>
  );
}

function Filters(props: {
  filter: DecisionFilter;
  set: (p: Partial<DecisionFilter>) => void;
  all: AuditDecision[];
  missions: MapSnapshot[];
  people: string[];
  compact: boolean;
}) {
  const { filter, set, all } = props;
  const count = (f: (d: AuditDecision) => boolean) => all.filter(f).length;
  if (props.compact)
    return (
      <div className="dv-filters compact">
        <select value={filter.mapId ?? ''} onChange={(e) => set({ mapId: e.target.value || undefined })} aria-label="Mission">
          <option value="">All missions</option>
          {props.missions.map((s) => (
            <option key={s.map.id} value={s.map.id}>
              {s.map.key} {s.map.title}
            </option>
          ))}
        </select>
        <select value={filter.source ?? ''} onChange={(e) => set({ source: (e.target.value || undefined) as DecisionSourceKind | undefined })} aria-label="Source">
          <option value="">All sources</option>
          {DECISION_SOURCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {DECISION_SOURCES[k].label}
            </option>
          ))}
        </select>
        <select value={filter.decidedBy ?? ''} onChange={(e) => set({ decidedBy: e.target.value || undefined })} aria-label="Decided by">
          <option value="">Anyone</option>
          {props.people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select value={filter.status ?? ''} onChange={(e) => set({ status: (e.target.value || undefined) as DecisionStatus | undefined })} aria-label="Status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="superseded">Superseded</option>
        </select>
      </div>
    );
  const Opt = (p: { on: boolean; label: string; n: number; onClick: () => void; cls?: string }) => (
    <li>
      <button className={`dv-opt ${p.on ? 'on' : ''} ${p.cls ?? ''}`} onClick={p.onClick}>
        <span className="ttl">{p.label}</span>
        <b>{p.n}</b>
      </button>
    </li>
  );
  return (
    <aside className="dv-filters">
      <h3 className="mono-label">Mission</h3>
      <ul>
        <Opt on={!filter.mapId} label="All missions" n={all.length} onClick={() => set({ mapId: undefined })} />
        {props.missions.map((s) => (
          <Opt key={s.map.id} on={filter.mapId === s.map.id} label={`${s.map.key} ${s.map.title}`} n={count((d) => d.mapId === s.map.id)} onClick={() => set({ mapId: s.map.id })} />
        ))}
      </ul>
      <h3 className="mono-label">Source</h3>
      <ul>
        <Opt on={!filter.source} label="All" n={all.length} onClick={() => set({ source: undefined })} />
        {DECISION_SOURCE_KINDS.map((k) => (
          <Opt key={k} cls={`src-${k}`} on={filter.source === k} label={DECISION_SOURCES[k].label} n={count((d) => d.source.kind === k)} onClick={() => set({ source: filter.source === k ? undefined : k })} />
        ))}
      </ul>
      <h3 className="mono-label">Decided by</h3>
      <ul>
        <Opt on={!filter.decidedBy} label="Anyone" n={all.length} onClick={() => set({ decidedBy: undefined })} />
        {props.people.map((p) => (
          <Opt key={p} on={filter.decidedBy === p} label={p} n={count((d) => d.decidedBy === p)} onClick={() => set({ decidedBy: filter.decidedBy === p ? undefined : p })} />
        ))}
      </ul>
      <h3 className="mono-label">Status</h3>
      <ul>
        <Opt on={!filter.status} label="Any" n={all.length} onClick={() => set({ status: undefined })} />
        <Opt on={filter.status === 'active'} label="Active" n={count((d) => !d.supersededBy)} onClick={() => set({ status: filter.status === 'active' ? undefined : 'active' })} />
        <Opt on={filter.status === 'superseded'} label="Superseded" n={count((d) => !!d.supersededBy)} onClick={() => set({ status: filter.status === 'superseded' ? undefined : 'superseded' })} />
      </ul>
    </aside>
  );
}

function SourceTag({ kind }: { kind: DecisionSourceKind }) {
  return (
    <span className={`src-tag src-${kind}`} title={DECISION_SOURCES[kind].label}>
      {DECISION_SOURCES[kind].code}
    </span>
  );
}

function Row(props: { d: AuditDecision; newDay: boolean; mission?: string; on: boolean; showMission: boolean; onClick: () => void }) {
  const { d } = props;
  const status = decisionStatus(d);
  return (
    <>
      {props.newDay && <li className="dv-day mono-label">{day(d.decidedAt)}</li>}
      <li className={`dv-row ${props.on ? 'on' : ''} ${status}`}>
        <button onClick={props.onClick}>
          <span className="t">{hm(d.decidedAt)}</span>
          <span className="id">{d.id}</span>
          <SourceTag kind={d.source.kind} />
          {props.showMission && <span className="key">{props.mission}</span>}
          <span className="key tk">{d.ticketKey ?? '—'}</span>
          <span className="sum">
            <span className="q">{d.question}</span>
            <span className="a">{d.summary}</span>
          </span>
          <span className="by">{d.decidedBy}</span>
          <span className={`st ${status}`}>{status === 'superseded' ? `→ ${d.supersededBy}` : d.supersedes ? `↺ ${d.supersedes}` : 'active'}</span>
        </button>
      </li>
    </>
  );
}

function Detail(props: {
  d: AuditDecision;
  all: AuditDecision[];
  snap?: MapSnapshot;
  onSelect: (id: string) => void;
  onOpenTicket: (mapId: string, ticketId: string) => void;
  onSupersede: CommandCenterApi['actions']['supersede'];
}) {
  const { d, snap } = props;
  const [form, setForm] = useState(false);
  const [answer, setAnswer] = useState('');
  const [rationale, setRationale] = useState('');
  useEffect(() => {
    setForm(false);
    setAnswer('');
    setRationale('');
  }, [d.id, d.mapId]);
  const chain = supersessionChain(
    props.all.filter((x) => x.mapId === d.mapId),
    d.id,
  );
  const status = decisionStatus(d);
  const ticket = d.ticketId ? snap?.tickets.find((t) => t.id === d.ticketId) : undefined;
  const now = Date.now();
  return (
    <div className="detail dv-d">
      <div className="d-head">
        <span className="key">{d.id}</span>
        <span className={`state-pill dv-st-${status}`}>{status}</span>
        <SourceTag kind={d.source.kind} />
        <span className="att-tag">
          {stamp(d.decidedAt)} · {ago(now - d.decidedAt)} ago
        </span>
      </div>
      <h3>{d.question}</h3>
      <div className="resolution">
        <div className="dim">Decision</div>
        <p>{d.answer}</p>
      </div>

      <dl className="facts">
        <dt>Mission</dt>
        <dd>{snap ? `${snap.map.key} ${snap.map.title}` : d.mapId}</dd>
        <dt>Ticket</dt>
        <dd>
          {d.ticketId ? (
            <button className="link" onClick={() => props.onOpenTicket(d.mapId, d.ticketId!)}>
              {d.ticketKey} {ticket?.title ?? ''} · open in mission ›
            </button>
          ) : (
            '—'
          )}
        </dd>
        <dt>Decided by</dt>
        <dd>{d.decidedBy}</dd>
        {d.participants.length > 1 && (
          <>
            <dt>Participants</dt>
            <dd>{d.participants.map((p) => p.name ?? p.id).join(', ')}</dd>
          </>
        )}
        <dt>Source</dt>
        <dd>
          {DECISION_SOURCES[d.source.kind].label}
          {d.source.url ? (
            <>
              {' · '}
              <a href={d.source.url} target="_blank" rel="noreferrer">
                {d.source.label ?? 'link'}
              </a>
            </>
          ) : d.source.label ? (
            ` · ${d.source.label}`
          ) : null}
          {d.source.ref && <span className="ref"> {d.source.ref}</span>}
        </dd>
      </dl>

      {d.alternatives.length > 0 && (
        <div className="dv-sec">
          <h4 className="mono-label">Alternatives</h4>
          <ul className="dv-alts">
            {d.alternatives.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {d.rationale && (
        <div className="dv-sec">
          <h4 className="mono-label">Rationale</h4>
          <p>{d.rationale}</p>
        </div>
      )}

      {chain.length > 1 && (
        <div className="dv-sec">
          <h4 className="mono-label">Supersession</h4>
          <ol className="dv-chain">
            {chain.map((c) => (
              <li key={c.id} className={`${c.id === d.id ? 'cur' : ''} ${c.supersededBy ? 'old' : 'live'}`}>
                <button onClick={() => props.onSelect(c.id)}>
                  <i />
                  <span className="id">{c.id}</span>
                  <span className="a">{c.summary}</span>
                  <span className="by">
                    {c.decidedBy} · {day(c.decidedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="actions">
        {status === 'active' && (
          <button className={`btn ${form ? 'on' : ''}`} onClick={() => setForm((f) => !f)}>
            Supersede…
          </button>
        )}
      </div>
      {form && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!answer.trim()) return;
            void props.onSupersede(d, { answer: answer.trim(), rationale: rationale.trim(), alternatives: [d.summary] });
            setForm(false);
          }}
        >
          <label>New decision</label>
          <textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus />
          <label>Rationale</label>
          <input value={rationale} onChange={(e) => setRationale(e.target.value)} />
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={() => setForm(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!answer.trim()}>
              Supersede
            </button>
          </div>
        </form>
      )}

      <div className="dv-sec">
        <h4 className="mono-label">
          Transcript <span className="n">{d.transcript.length}</span>
        </h4>
        {d.transcript.length ? (
          <div className="dv-transcript comms-log">
            {d.transcript.map((m, i) => (
              <div key={i} className={`msg from-${m.from} voice-${m.from === 'human' ? 'human' : 'agent'}`}>
                <div className="msg-meta">
                  {m.author} · {hm(m.at)}
                </div>
                <div className="msg-text">{m.text}</div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>None recorded</Empty>
        )}
      </div>
    </div>
  );
}
