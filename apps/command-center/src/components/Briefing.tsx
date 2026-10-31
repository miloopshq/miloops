import { useEffect, type ReactNode } from 'react';
import type { Briefing, DecisionRecord, MapSnapshot, MissionBriefing, PendingQuestion, SessionInfo, Ticket } from '@miloops-hq/core';
import { MiloAvatar } from './milo';
import { MiloMark } from './MiloMark';
import { dur, tokens, usd, type Breakpoint } from './Hud';
import { Button, Card, Label, Meta, Panel } from './ui';

const DAY = 86_400_000;

function sinceLabel(since: number, now: number) {
  const d = new Date(since);
  const hm = d.toTimeString().slice(0, 5);
  const today = new Date(now).toDateString();
  const yesterday = new Date(now - DAY).toDateString();
  const day = d.toDateString() === today ? '' : d.toDateString() === yesterday ? ' yesterday' : ` ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  return `Since ${hm}${day} · ${dur(now - since)}`;
}

function Tile(props: { label: string; value: ReactNode; sub?: ReactNode; urgent?: boolean; className?: string }) {
  return (
    <Card tone={props.urgent ? 'urgent' : undefined} className={`bf-tile ${props.className ?? ''}`}>
      <span className="mono-label">{props.label}</span>
      <b>{props.value}</b>
      {props.sub && <Meta parts={[props.sub]} />}
    </Card>
  );
}

function List(props: { title: string; urgent?: boolean; children: ReactNode[] }) {
  if (!props.children.length) return null;
  return (
    <div className={`bf-list ${props.urgent ? 'urgent' : ''}`}>
      <span className="mono-label">{props.title}</span>
      <ul>{props.children}</ul>
    </div>
  );
}

function Row(props: { k: string; text: ReactNode; meta?: ReactNode; onClick: () => void; title?: string }) {
  return (
    <li>
      <button className="bf-row" onClick={props.onClick} title={props.title}>
        <span className="key">{props.k}</span>
        <span className="t">{props.text}</span>
        {props.meta && <Meta as="span" parts={[props.meta]} />}
      </button>
    </li>
  );
}

export interface BriefingActions {
  onTicket: (mapId: string, ticketId: string) => void;
  onAnswer: (q: PendingQuestion) => void;
  onDecision: (id: string) => void;
  onSession: (s: SessionInfo) => void;
  onResume: () => void;
  onClose: () => void;
}

/** "While you were away": what changed in each mission since the operator was last present. */
export function BriefingDialog(props: { briefing?: Briefing; line: string; snaps: Record<string, MapSnapshot>; bp: Breakpoint } & BriefingActions) {
  const { briefing: b, bp, onClose } = props;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const first = b?.missions.flatMap((m) => m.waiting).sort((x, y) => x.at - y.at)[0];
  const t = b?.totals;
  const multi = (b?.missions.length ?? 0) > 1;
  const phone = bp === 'mobile';
  const ticketTitle = (q: PendingQuestion) => (q.ticketId && props.snaps[q.mapId]?.tickets.find((x) => x.id === q.ticketId)?.title) || q.text;
  const ticketKey = (q: PendingQuestion) => (q.ticketId && props.snaps[q.mapId]?.tickets.find((x) => x.id === q.ticketId)?.key) || q.agent;

  const lists = (m: MissionBriefing) => {
    const ticket = (x: Ticket, meta?: ReactNode) => <Row key={x.id} k={x.key} text={x.title} meta={meta} onClick={() => props.onTicket(m.mapId, x.id)} />;
    const decision = (d: DecisionRecord) => <Row key={d.id} k={d.id} text={d.summary || d.answer} title={d.question} onClick={() => props.onDecision(d.id)} />;
    const left = [
      <List key="done" title="Done">{m.done.map((x) => ticket(x))}</List>,
      <List key="oos" title="Ruled out">{phone ? [] : m.ruledOut.map((x) => ticket(x))}</List>,
      <List key="blocked" title="Blocked">{m.blocked.map((x) => ticket(x.ticket, `needs ${x.on.map((o) => o.key).join(', ')}`))}</List>,
    ];
    const right = [
      <List key="waiting" title="Waiting on you" urgent>
        {m.waiting.map((q) => (
          <Row key={q.id} k={ticketKey(q)} text={ticketTitle(q)} meta={b!.now - q.at < 60_000 ? 'now' : dur(b!.now - q.at)} title={q.text} onClick={() => props.onAnswer(q)} />
        ))}
      </List>,
      <List key="agent" title="Agent decisions">{phone ? [] : m.agentDecisions.map(decision)}</List>,
      <List key="active" title="Active sessions">
        {phone
          ? []
          : m.active.map((s) => {
              const tk = s.ticketId ? props.snaps[m.mapId]?.tickets.find((x) => x.id === s.ticketId) : undefined;
              return <Row key={s.id} k={tk?.key ?? s.agent} text={tk ? `${tk.title} · ${s.stepLabel}` : s.stepLabel} meta={`${s.step}/${s.total}`} onClick={() => props.onSession(s)} />;
            })}
      </List>,
    ];
    return (
      <section key={m.mapId} className="bf-mission">
        {multi && (
          <div className="bf-mission-h">
            <span className="key">{m.key}</span> {m.title}
          </div>
        )}
        <div className="bf-cols">
          <div>{left}</div>
          <div>{right}</div>
        </div>
      </section>
    );
  };

  return (
    <div className="scrim" onClick={onClose}>
      <Panel as="div" className="dialog briefing" role="dialog" aria-label="While you were away" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 className="t-heading caps">While you were away</h2>
          {b && b.missions.length > 0 && <Label className="bf-since">{sinceLabel(b.since, b.now)}</Label>}
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <Card className="bf-milo">
          <MiloAvatar size={phone ? 2 : 'sm'} speaking={props.line || 'Nothing new since you were last here.'} caption={false} framed={false} />
          <div>
            <span className="mono-label">MILO</span>
            <p>{props.line || 'Nothing new since you were last here.'}</p>
          </div>
        </Card>
        {b && t && b.missions.length > 0 && (
          <>
            <div className="bf-tiles">
              <Tile label="Done" value={t.done} sub={t.ruledOut ? `${t.ruledOut} ruled out` : undefined} />
              <Tile label="Blocked" value={t.blocked} sub={t.blocked ? 'Needs your answer' : undefined} />
              <Tile label="Waiting on you" value={t.waiting} sub={t.oldestWaitMs !== undefined ? (t.oldestWaitMs < 60_000 ? 'Just asked' : `Oldest ${dur(t.oldestWaitMs)}`) : undefined} urgent={t.waiting > 0} />
              <Tile label="Agent decisions" value={t.agentDecisions} className="opt" />
              <Tile
                label="Spend"
                value={usd(t.usage.costUsd)}
                sub={`${tokens(t.usage.inputTokens + t.usage.outputTokens)} tokens · ${t.usage.sessions} sessions${t.active ? ` · ${t.active} active` : ''}`}
              />
            </div>
            <div className="bf-body">{b.missions.map(lists)}</div>
          </>
        )}
        <footer>
          <Button onClick={onClose}>Dismiss</Button>
          {first ? (
            <Button variant="urgent" onClick={() => props.onAnswer(first)}>
              <MiloMark variant="alert" size={13} />
              Answer first decision
            </Button>
          ) : (
            <Button variant="primary" onClick={props.onResume}>
              Resume mission
            </Button>
          )}
        </footer>
      </Panel>
    </div>
  );
}
