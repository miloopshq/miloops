import { useEffect, useRef, useState, type ReactNode } from 'react';
import { hitlStats, type ActivityState, type MapSnapshot, type PendingQuestion } from '@miloops-hq/core';
import { Empty, ago, clock, dur, useNow } from './Hud';
import { MiloMark } from './MiloMark';
import { MiloAvatar } from './milo';
import { Badge, Card, InputRow, Meta, Panel, Readout, SectionHeader } from './ui';

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
      <Readout layout="inline" label="Oldest" value={h.oldestAt ? dur(now - h.oldestAt) : '—'} urgent={!!h.oldestAt && now - h.oldestAt > 60_000} title="Oldest open question" />
      <Readout layout="inline" label="Avg wait" value={h.avgWaitMs !== undefined ? dur(h.avgWaitMs) : '—'} title={`Average wait over ${h.answered} answered questions`} />
      <Readout layout="inline" label="Answered" value={h.answered} />
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
      <SectionHeader
        hot={items.length > 0}
        title={
          <>
            {items.length > 0 && <MiloMark variant="alert" size={12} />}
            Waiting on you
          </>
        }
        count={<Badge key={items.length} n={items.length} urgent={items.length > 0} pop />}
      />
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
      <Panel className="zone inbox stack">
        {view === 'conv' && props.sessionId ? (
          conv
        ) : (
          <div className="stack-scroll">
            {list}
            {props.below}
          </div>
        )}
      </Panel>
    );
  const hasConv = !!props.activity.sessions.find((s) => s.id === props.sessionId);
  return (
    <Panel className={`zone inbox split ${hasConv ? 'has-conv' : ''}`} style={{ gridArea: 'inbox' }}>
      {list}
      {hasConv && conv}
      {props.below}
    </Panel>
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
            <Card as="button" tone="urgent" on={q.sessionId === props.selected} onClick={() => props.onOpen(q.sessionId, q.ticketId)}>
              <span className="row1">
                <span className="who">{q.agent}</span>
                <span className="key">{t?.key}</span>
                {now - q.at < INCOMING_MS && <span className="signal-tag">Incoming</span>}
                <span className="age">{ago(now - q.at)}</span>
              </span>
              {many && <Meta className={`mission-tag ${q.mapId === props.currentMapId ? 'cur' : ''}`} parts={[s?.map.title ?? q.mapId]} />}
              <span className="ttl">{t?.title}</span>
              <span className="q t-title">{q.text.split('\n')[0]}</span>
            </Card>
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
    <div className={`comms ${pending ? 'asking' : ''}`}>
      <SectionHeader title="HITL line" right={session ? <span className={`status ${pending ? 'urgent' : session.status}`}>{status}</span> : undefined}>
        {props.onBack && (
          <button className="back" onClick={props.onBack} aria-label="Back to inbox">
            ‹ Inbox
          </button>
        )}
      </SectionHeader>
      {!session ? (
        <Empty>No conversation</Empty>
      ) : (
        <>
          <div className="comms-ticket t-title">
            <span className="key">{ticket?.key}</span> {ticket?.title}
            <Meta parts={[mission?.map.title, session.agent]} />
          </div>
          <div className="comms-log" ref={logRef}>
            {messages.map((m) => {
              const open = !!m.questionId && m.questionId === pending?.id;
              return (
                <div key={m.id} className={`msg from-${m.from} voice-${m.from === 'human' ? 'human' : 'agent'} ${open ? 'open-q' : ''}`}>
                  {open && <MiloAvatar size="xs" state="alert" className="q-avatar" />}
                  <Meta parts={[m.author, clock(m.at)]} />
                  <div className="msg-text">{m.text}</div>
                </div>
              );
            })}
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
          <InputRow ref={inputRef} className="comms-input" value={draft} onValueChange={setDraft} onSubmit={send} disabled={!pending} placeholder={pending ? 'Answer' : ''} />
        </>
      )}
    </div>
  );
}
