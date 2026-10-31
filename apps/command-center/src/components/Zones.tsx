import { useState } from 'react';
import {
  attention,
  claimsByAgent,
  criticalPath,
  deriveStates,
  missionUsage,
  sessionTokens,
  stateCounts,
  STEPS,
  throughput,
  typeMix,
  type ActivityState,
  type MapSnapshot,
  type NodeState,
  type TicketType,
} from '@miloops-hq/core';
import type { Selection } from '../useCommandCenter';
import { Empty, Spark, Tabs, Zone, clock, hms, tokens, usd, useNow } from './Hud';

const TYPE_CODE: Record<TicketType, string> = { research: 'RSCH', prototype: 'PROT', grilling: 'GRIL', task: 'TASK', execute: 'EXEC' };
import { STATE_TEXT } from './Inspector';
import { MiloMark } from './MiloMark';

type Tab = 'unspecified' | 'decisions' | 'oos' | 'notes';

/** Map body sections ("the plan"): a static list per section, one tab each. */
export function MapSections({ snap, selection, onSelect, bare, onAudit }: { snap?: MapSnapshot; selection: Selection; onSelect: (s: Selection) => void; bare?: boolean; onAudit?: () => void }) {
  const [tab, setTab] = useState<Tab>('unspecified');
  const s = snap?.map.sections;
  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: 'unspecified', label: 'Not yet specified', n: s?.unspecified.length },
    { id: 'decisions', label: 'Decisions', n: s?.decisions.length },
    { id: 'oos', label: 'Out of scope', n: s?.outOfScope.length },
    { id: 'notes', label: 'Notes' },
  ];
  const body = !s ? (
    <Empty>No mission</Empty>
  ) : tab === 'decisions' ? (
    s.decisions.length ? (
      <ol className="list decisions">
        {[...s.decisions].reverse().map((d, i) => (
          <li key={`${d.ticketKey}-${i}`}>
            <button onClick={() => d.ticketId && onSelect({ kind: 'ticket', id: d.ticketId })}>
              <span className="key">{d.ticketKey}</span>
              <span>{d.text}</span>
            </button>
          </li>
        ))}
      </ol>
    ) : (
      <Empty>None</Empty>
    )
  ) : tab === 'unspecified' ? (
    s.unspecified.length ? (
      <ul className="list unspecified">
        {s.unspecified.map((f) => (
          <li key={f} className={selection?.kind === 'unspecified' && selection.item === f ? 'sel' : ''}>
            <button onClick={() => onSelect({ kind: 'unspecified', item: f })}>{f}</button>
          </li>
        ))}
      </ul>
    ) : (
      <Empty>None</Empty>
    )
  ) : tab === 'oos' ? (
    s.outOfScope.length ? (
      <ul className="list oos">
        {s.outOfScope.map((o) => (
          <li key={o}>{o}</li>
        ))}
      </ul>
    ) : (
      <Empty>None</Empty>
    )
  ) : (
    <p className="notes">{s.notes || '—'}</p>
  );
  return (
    <section className={`zone sections ${bare ? 'bare' : ''}`} style={bare ? undefined : { gridArea: 'plan' }}>
      <div className="sections-tabs">
        <Tabs className="sub" value={tab} onChange={setTab} items={tabs} />
        {tab === 'decisions' && onAudit && (
          <button className="link" onClick={onAudit}>
            Audit ›
          </button>
        )}
      </div>
      <div className="zone-b">{body}</div>
    </section>
  );
}

/** Pick the session whose step to feature: the latest one that reported a step. */
function featured(activity: ActivityState) {
  const last = [...activity.feed].reverse().find((e) => e.level === 'step' && e.sessionId);
  return last ? activity.sessions.find((s) => s.id === last.sessionId) : undefined;
}

/** "WORK 3/5 : RESOLVE #6" with the step pipeline underneath. */
export function StepTracker({ activity, snap }: { activity: ActivityState; snap?: MapSnapshot }) {
  const s = featured(activity);
  if (!s) return <Empty>No session yet</Empty>;
  const t = s.ticketId ? snap?.tickets.find((x) => x.id === s.ticketId) : undefined;
  const steps = STEPS[s.mode];
  const status = s.waitingOn ? 'waiting on you' : s.status;
  return (
    <div className={`step-tracker ${s.waitingOn ? 'waiting' : ''}`}>
      <div className="st-meta">
        <span className="mono-label">{s.agent}</span>
        <span className={`mono-label st-status ${s.waitingOn ? 'urgent' : s.status}`}>// {status}</span>
      </div>
      <div className="st-big">
        {s.mode} {s.step}/{s.total} : {s.stepLabel}
        {t && <span className="st-key"> {t.key}</span>}
      </div>
      <ol className="pipeline">
        {steps.map((label, i) => {
          const n = i + 1;
          const cls = n < s.step || (n === s.step && s.status === 'done') ? 'done' : n === s.step ? 'cur' : '';
          return (
            <li key={label} className={cls}>
              <i />
              <span>
                {String(n).padStart(2, '0')} {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Who is working on what: agent sessions with live timers, plus claims without a session (e.g. teammates). */
export function Sessions({ snap, activity, onSelect, onOpenChat }: { snap?: MapSnapshot; activity: ActivityState; onSelect: (s: Selection) => void; onOpenChat: (id: string) => void }) {
  const now = useNow(1000);
  const running = activity.sessions.filter((s) => s.status === 'running');
  const live = new Set(running.map((s) => s.ticketId));
  const claims = snap?.tickets.filter((t) => t.state === 'open' && t.assignee && !live.has(t.id)) ?? [];
  if (!running.length && !claims.length) return <Empty>Idle</Empty>;
  return (
    <ul className="sessions-list">
      {running.map((s) => {
        const t = snap?.tickets.find((x) => x.id === s.ticketId);
        const att = t ? attention(t) : undefined;
        return (
          <li key={s.id} className={s.waitingOn ? 'waiting' : ''}>
            <button
              onClick={() => {
                if (t) onSelect({ kind: 'ticket', id: t.id });
                if (att === 'hitl') onOpenChat(s.id);
              }}
            >
              <span className="row">
                <span className="callsign">{s.agent}</span>
                {att && <span className={`att-chip ${att}`}>{att === 'hitl' ? 'HITL' : 'AFK'}</span>}
                {s.usage && (
                  <span className="usage" title={`${s.usage.inputTokens.toLocaleString()} in · ${s.usage.outputTokens.toLocaleString()} out`}>
                    {tokens(sessionTokens(s))} tok · {usd(s.usage.costUsd)}
                  </span>
                )}
                <span className="timer">{hms(now - s.startedAt)}</span>
              </span>
              <span className="segs">
                {Array.from({ length: s.total }, (_, i) => (
                  <i key={i} className={i < s.step - 1 ? 'done' : i === s.step - 1 ? 'cur' : ''} />
                ))}
              </span>
              <span className="row">
                {s.waitingOn ? <span className="urgent-text">
                    <MiloMark variant="alert" size={11} /> Waiting on you
                  </span> : <span className="dim">{s.mode} · {s.stepLabel.toLowerCase()}</span>}
                <span className="tkt">{t ? `${t.key} ${t.title}` : s.mode === 'chart' ? 'Charting mission' : ''}</span>
              </span>
            </button>
          </li>
        );
      })}
      {claims.map((t) => (
        <li key={t.id} className="claim">
          <button onClick={() => onSelect({ kind: 'ticket', id: t.id })}>
            <span className="row">
              <span className="callsign">{t.assignee}</span>
              <span className="mono-label dim">claim</span>
            </span>
            <span className="row">
              <span className="tkt">
                {t.key} {t.title}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Dense activity log: time, source, message. */
export function ActivityLog({ activity, onTicket }: { activity: ActivityState; onTicket: (id: string) => void }) {
  const rows = activity.feed.slice(-120).reverse();
  return (
    <div className="log">
      {rows.map((e) => (
        <div key={e.id} className={`log-row lv-${e.level} src-${e.source} ${e.signal ? 'signal' : ''}`} onClick={() => e.ticketId && onTicket(e.ticketId)}>
          <span className="t">{clock(e.at)}</span>
          <span className="src">
            {e.source === 'system' && <MiloMark variant="voice" size={10} />}
            {e.agent ?? e.source}
          </span>
          <span className="msg">
            {e.tag && <span className="tag">{e.tag} · </span>}
            {e.text}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Sessions header: mission usage (`metrics.usage`) and claims per agent (`metrics.claimsByAgent`). */
function SessionsHead({ activity, snap, running }: { activity: ActivityState; snap?: MapSnapshot; running: number }) {
  const u = missionUsage(activity, snap?.map.id);
  const claims = snap ? claimsByAgent(snap) : [];
  return (
    <>
      <div className="sessions-head">
        <h3 className="chip-label sub">
          Sessions // claims <span className="n">{running}</span>
        </h3>
        <span className="usage total" title="Model usage for this mission, all sessions">
          <span className="mono-label">Mission</span> {tokens(u.inputTokens + u.outputTokens)} tok · {usd(u.costUsd)}
        </span>
      </div>
      {claims.length > 0 && (
        <ul className="claims-bar" aria-label="Claims per agent">
          {claims.map((c) => (
            <li key={c.agent}>
              <span className="callsign">{c.agent}</span>
              <span className="pips">
                {Array.from({ length: c.count }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
              <b>{c.count}</b>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

type ZoneProps = { activity: ActivityState; snap?: MapSnapshot; onTicket: (id: string) => void; onOpenChat: (id: string) => void };

/** Wide: current step + sessions in one fixed zone. */
export function StepZone(props: ZoneProps) {
  const running = props.activity.sessions.filter((s) => s.status === 'running').length;
  return (
    <section className="zone step-zone" style={{ gridArea: 'step' }}>
      <header className="zone-h">
        <h2 className="chip-label">Current step</h2>
      </header>
      <div className="zone-b">
        <StepTracker activity={props.activity} snap={props.snap} />
        <SessionsHead activity={props.activity} snap={props.snap} running={running} />
        <Sessions snap={props.snap} activity={props.activity} onSelect={(s) => s?.kind === 'ticket' && props.onTicket(s.id)} onOpenChat={props.onOpenChat} />
      </div>
    </section>
  );
}

/** Wide: the activity log zone. */
export function LogZone(props: ZoneProps) {
  return (
    <Zone area="log" className="log-zone" title="Activity log" right={<span className="mono-label dim">{props.activity.feed.length} events</span>}>
      <ActivityLog activity={props.activity} onTicket={props.onTicket} />
    </Zone>
  );
}

/** Laptop tab / phone view: step, sessions and log stacked. */
export function ActivityStack(props: ZoneProps) {
  return (
    <div className="zone-b activity-stack">
      <StepTracker activity={props.activity} snap={props.snap} />
      <SessionsHead activity={props.activity} snap={props.snap} running={props.activity.sessions.filter((s) => s.status === 'running').length} />
      <Sessions snap={props.snap} activity={props.activity} onSelect={(s) => s?.kind === 'ticket' && props.onTicket(s.id)} onOpenChat={props.onOpenChat} />
      <h3 className="chip-label sub">Activity log</h3>
      <ActivityLog activity={props.activity} onTicket={props.onTicket} />
    </div>
  );
}

const ORDER: [NodeState, string][] = [
  ['decided', 'Decided'],
  ['claimed', 'Claimed'],
  ['frontier', 'Frontier'],
  ['blocked', 'Blocked'],
  ['parked', 'Parked'],
  ['out-of-scope', 'Ruled out'],
];

/** Mission status counters (also the map legend) and the resolution bar. */
export function StatusPanel({ snap, sessions }: { snap: MapSnapshot; sessions: ActivityState['sessions'] }) {
  const now = useNow(5000);
  const c = stateCounts(snap);
  const n = (s: NodeState) => c[s];
  const pct = c.resolvedPct;
  const waiting = sessions.filter((s) => s.status === 'running' && s.waitingOn).length;
  const path = criticalPath(snap);
  const tp = throughput(snap, now);
  const mix = typeMix(snap);
  const mixMax = Math.max(1, ...mix.map((m) => m.open + m.closed));
  return (
    <div className="status-panel">
      <div className="sp-head">
        <h3 className="chip-label">Status</h3>
        <span className="mono-label">{c.total} tickets</span>
      </div>
      <ul>
        {ORDER.map(([s, label]) => (
          <li key={s} className={`st-${s} ${n(s) ? '' : 'zero'}`}>
            <i />
            <span>{label}</span>
            <b>{String(n(s)).padStart(2, '0')}</b>
          </li>
        ))}
        <li className={`st-waiting ${waiting ? '' : 'zero'}`}>
          <i />
          <span>Waiting on you</span>
          <b>{String(waiting).padStart(2, '0')}</b>
        </li>
      </ul>
      <div className="resolution">
        <span className="mono-label">Resolution</span>
        <span className="bar">
          <i style={{ width: `${pct}%` }} />
        </span>
        <b>{pct}%</b>
      </div>
      <div className="sp-row" title={path.length ? `Longest open blocking chain: ${path.map((t) => t.key).join(' → ')}` : 'No open tickets'}>
        <span className="mono-label">Critical path</span>
        <b>{String(path.length).padStart(2, '0')}</b>
      </div>
      <div className="sp-block" title="Bars: decided per interval since the mission started. Line: open tickets (burndown).">
        <div className="sp-row">
          <span className="mono-label">Decided / h</span>
          <b>{tp.lastHour}</b>
        </div>
        <Spark line={tp.open} bars={tp.decided} height={24} />
        <div className="sp-axis mono-label">
          <span>T+0</span>
          <span>now</span>
        </div>
      </div>
      <div className="sp-block">
        <span className="mono-label">Type mix</span>
        <ul className="mix">
          {mix.map((m) => (
            <li key={m.type} title={`${m.type}: ${m.closed} closed, ${m.open} open`}>
              <span className="mono-label">{TYPE_CODE[m.type]}</span>
              <span className="mix-bar">
                <i className="closed" style={{ width: `${(m.closed / mixMax) * 100}%` }} />
                <i className="open" style={{ width: `${(m.open / mixMax) * 100}%` }} />
              </span>
              <b>{m.open + m.closed}</b>
            </li>
          ))}
        </ul>
      </div>
      <div className="legend-extra mono-label">
        <span>● HITL</span>
        <span>○ AFK</span>
      </div>
    </div>
  );
}

/** Layer 3: the tickets that can move now (frontier) or are moving (claimed), as a compact list. */
export function UpNext(props: { snap?: MapSnapshot; sessions: ActivityState['sessions']; selection: Selection; onSelect: (s: Selection) => void; onWork?: () => void }) {
  const { snap } = props;
  const states = snap ? deriveStates(snap.tickets, snap.map.mode) : new Map<string, NodeState>();
  const rank: Partial<Record<NodeState, number>> = { claimed: 0, frontier: 1 };
  const items = (snap?.tickets ?? []).filter((t) => rank[states.get(t.id)!] !== undefined).sort((a, b) => rank[states.get(a.id)!]! - rank[states.get(b.id)!]!);
  const waiting = new Set(props.sessions.filter((s) => s.status === 'running' && s.waitingOn).map((s) => s.ticketId));
  const selId = props.selection?.kind === 'ticket' ? props.selection.id : undefined;
  return (
    <div className="upnext">
      <header className="part-h">
        <h2 className="chip-label">Up next</h2>
        <span className="n mono-label">{items.length}</span>
        {props.onWork && (
          <button className="part-h-right link" onClick={props.onWork} disabled={!items.some((t) => states.get(t.id) === 'frontier')}>
            Work next ›
          </button>
        )}
      </header>
      {!snap ? (
        <Empty>No mission</Empty>
      ) : !items.length ? (
        <Empty>Frontier empty</Empty>
      ) : (
        <ul className="ticket-list">
          {items.map((t) => {
            const st = states.get(t.id)!;
            return (
              <li key={t.id} className={`${selId === t.id ? 'sel' : ''} st-${waiting.has(t.id) ? 'waiting' : st}`}>
                <button onClick={() => props.onSelect({ kind: 'ticket', id: t.id })}>
                  <i className="dot" />
                  <span className="key">{t.key}</span>
                  <span className="ttl">{t.title}</span>
                  <span className="human">{attention(t) === 'hitl' ? '●' : '○'}</span>
                  <span className="st-text">{waiting.has(t.id) ? 'waiting' : st === 'claimed' ? t.assignee : STATE_TEXT[st].toLowerCase()}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
