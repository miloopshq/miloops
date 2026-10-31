import { useEffect, useRef, useState, type ReactNode } from 'react';
import { hitlStats, type ActivityState, type MapSnapshot, type PendingQuestion } from '@miloops-hq/core';
import { Empty, ago, clock, dur, useNow } from './Hud';
import { MiloMark } from './MiloMark';
import { MiloAvatar } from './milo';

/**
 * The inbox column: HITL questions waiting on the operator (oldest first) and the
 * conversation for the selected one. `split` shows both stacked; `stack` (phones)
 * shows the list, then the conversation with a back button.
 */
/** `metrics.hitl`: age of the oldest open question and the average time questions waited on you. */
function HitlReadout({ activity }: { activity: ActivityState }) {
  const now = useNow(1000);
  const h = hitlStats(activity);
  return (
    <div className="hitl-readout">
      <span className={`ro ${h.oldestAt && now - h.oldestAt > 60_000 ? 'urgent-text' : ''}`} title="Oldest open question">
        <span className="mono-label">Oldest</span> <b>{h.oldestAt ? dur(now - h.oldestAt) : '—'}</b>
      </span>
      <span className="ro" title={`Average wait over ${h.answered} answered questions`}>
        <span className="mono-label">Avg wait</span> <b>{h.avgWaitMs !== undefined ? dur(h.avgWaitMs) : '—'}</b>
      </span>
      <span className="ro">
        <span className="mono-label">Answered</span> <b>{h.answered}</b>
      </span>
    </div>
  );
}

export function InboxPane(props: {
  activity: ActivityState;
  snaps: Record<string, MapSnapshot>;
  currentMapId?: string;
  sessionId?: string;
  layout: 'split' | 'stack';
  convRequest: number;
  onOpen: (sessionId: string, ticketId?: string) => void;
  onAnswer: (questionId: string, text: string) => void;
  /** Rendered under the inbox in the same column (the Up next list). */
  below?: ReactNode;
}) {
  const [view, setView] = useState<'list' | 'conv'>('list');
  useEffect(() => {
    if (props.convRequest) setView('conv');
  }, [props.convRequest]);
  const items = [...props.activity.pending].sort((a, b) => a.at - b.at);
  const open = (sessionId: string, ticketId?: string) => {
    props.onOpen(sessionId, ticketId);
    setView('conv');
  };

  const list = (
    <div className="inbox-part">
      <header className="part-h">
        <h2 className={`chip-label ${items.length ? 'hot' : ''}`}>{items.length > 0 && <MiloMark variant="alert" size={12} />}
          Waiting on you
        </h2>
        <span key={items.length} className={`badge ${items.length ? 'urgent pop' : ''}`}>
          {items.length}
        </span>
      </header>
      <HitlReadout activity={props.activity} />
      <InboxList items={items} snaps={props.snaps} currentMapId={props.currentMapId} selected={props.sessionId} onOpen={open} />
    </div>
  );
  const conv = (
    <Conversation
      activity={props.activity}
      snaps={props.snaps}
      sessionId={props.sessionId}
      onAnswer={props.onAnswer}
      onBack={props.layout === 'stack' ? () => setView('list') : undefined}
    />
  );

  if (props.layout === 'stack')
    return (
      <section className="zone inbox stack">
        {view === 'conv' && props.sessionId ? (
          conv
        ) : (
          <div className="stack-scroll">
            {list}
            {props.below}
          </div>
        )}
      </section>
    );
  const hasConv = !!props.activity.sessions.find((s) => s.id === props.sessionId);
  return (
    <section className={`zone inbox split ${hasConv ? 'has-conv' : ''}`} style={{ gridArea: 'inbox' }}>
      {list}
      {hasConv && conv}
      {props.below}
    </section>
  );
}

/** How long a new decision request carries the dot-matrix "Incoming" signal. */
const INCOMING_MS = 15_000;

function InboxList(props: {
  items: PendingQuestion[];
  snaps: Record<string, MapSnapshot>;
  currentMapId?: string;
  selected?: string;
  onOpen: (sessionId: string, ticketId?: string) => void;
}) {
  const now = useNow(1000);
  if (!props.items.length) return <Empty>Nothing waiting</Empty>;
  const many = Object.keys(props.snaps).length > 1;
  return (
    <ul className="inbox-list">
      {props.items.map((q) => {
        const s = props.snaps[q.mapId];
        const t = s?.tickets.find((x) => x.id === q.ticketId);
        return (
          <li key={q.id} className={q.sessionId === props.selected ? 'sel' : ''}>
            <button onClick={() => props.onOpen(q.sessionId, q.ticketId)}>
              <span className="row1">
                <span className="who">{q.agent}</span>
                <span className="key">{t?.key}</span>
                {now - q.at < INCOMING_MS && <span className="signal-tag">Incoming</span>}
                <span className="age">{ago(now - q.at)}</span>
              </span>
              {many && <span className={`mission-tag ${q.mapId === props.currentMapId ? 'cur' : ''}`}>{s?.map.title ?? q.mapId}</span>}
              <span className="ttl">{t?.title}</span>
              <span className="q">{q.text.split('\n')[0]}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Conversation(props: { activity: ActivityState; snaps: Record<string, MapSnapshot>; sessionId?: string; onAnswer: (questionId: string, text: string) => void; onBack?: () => void }) {
  const { activity, sessionId } = props;
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const session = activity.sessions.find((s) => s.id === sessionId);
  const messages = activity.chats.filter((m) => m.sessionId === sessionId);
  const pending = activity.pending.find((p) => p.sessionId === sessionId);
  const mission = session ? props.snaps[session.mapId] : undefined;
  const ticket = session?.ticketId ? mission?.tickets.find((t) => t.id === session.ticketId) : undefined;

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);
  useEffect(() => {
    if (pending && !props.onBack) inputRef.current?.focus({ preventScroll: true });
  }, [pending?.id, props.onBack]);

  const send = (text: string) => {
    if (!pending || !text.trim()) return;
    props.onAnswer(pending.id, text.trim());
    setDraft('');
  };
  const status = !session ? '' : pending ? 'Your answer is needed' : session.status === 'running' ? `${session.agent} is working…` : session.status === 'done' ? 'Resolved · ticket closed' : 'Session ended';

  return (
    <div className="comms">
      <header className="part-h">
        {props.onBack && (
          <button className="back" onClick={props.onBack} aria-label="Back to inbox">
            ‹ Inbox
          </button>
        )}
        <h2 className="chip-label">HITL line</h2>
        {session && <span className={`part-h-right status ${pending ? 'urgent' : session.status}`}>{status}</span>}
      </header>
      {!session ? (
        <Empty>No conversation</Empty>
      ) : (
        <>
          <div className="comms-milo">
            <MiloAvatar size="sm" state={pending ? 'alert' : 'idle'} />
            <div className="comms-ticket">
              <span className="key">{ticket?.key}</span> {ticket?.title}
              <div className="dim">
                {mission?.map.title} · {session.agent}
              </div>
            </div>
          </div>
          <div className="comms-log" ref={logRef}>
            {messages.map((m) => (
              <div key={m.id} className={`msg from-${m.from} voice-${m.from === 'human' ? 'human' : 'agent'} ${m.questionId && m.questionId === pending?.id ? 'open-q' : ''}`}>
                <div className="msg-meta">
                  {m.author} · {clock(m.at)}
                </div>
                <div className="msg-text">{m.text}</div>
              </div>
            ))}
          </div>
          {pending?.suggestions && (
            <div className="suggest">
              {pending.suggestions.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            className="comms-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <textarea
              ref={inputRef}
              rows={2}
              value={draft}
              disabled={!pending}
              placeholder={pending ? 'Answer' : ''}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
            />
            <button className="btn primary" disabled={!pending || !draft.trim()}>
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}
