import type { ActivityState, MapSnapshot } from '@miloops-hq/core';
import { MiloAvatar } from '@miloops-hq/milo-avatar';
import { useState, useRef, useEffect } from 'react';
import { SectionHeader, Empty, Meta, InputRow } from '../../components/ui';
import { clock, isRunning } from '../../lib';

export function Conversation(props: {
  activity: ActivityState;
  snaps: Record<string, MapSnapshot>;
  sessionId?: string;
  onAnswer: (questionId: string, text: string) => void;
  onBack?: () => void;
}) {
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
    const log = logRef.current;
    if (!log) return;
    const bottom = log.scrollHeight - log.clientHeight;
    const q = log.querySelector<HTMLElement>('.open-q');
    /* A question taller than the log is pinned by its top, so its avatar and label are never cut off above. */
    const qTop = q
      ? q.getBoundingClientRect().top -
        log.getBoundingClientRect().top +
        log.scrollTop -
        parseFloat(getComputedStyle(log).paddingTop)
      : bottom;
    log.scrollTo({ top: Math.min(bottom, qTop), behavior: 'smooth' });
  }, [messages.length, pending?.id]);
  useEffect(() => {
    if (pending && !props.onBack) inputRef.current?.focus({ preventScroll: true });
    // Refocus only when a different question arrives, not on every update of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.id, props.onBack]);

  const send = (text: string) => {
    if (!pending || !text.trim()) return;
    props.onAnswer(pending.id, text.trim());
    setDraft('');
  };
  const status = !session
    ? ''
    : pending
      ? 'Your answer is needed'
      : isRunning(session)
        ? `${session.agent} is working…`
        : session.status === 'done'
          ? 'Resolved · ticket closed'
          : 'Session ended';

  return (
    <div className={`comms ${pending ? 'asking' : ''}`}>
      <SectionHeader
        title="HITL line"
        right={session ? <span className={`status ${pending ? 'urgent' : session.status}`}>{status}</span> : undefined}
      >
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
                <div
                  key={m.id}
                  className={`msg from-${m.from} voice-${m.from === 'human' ? 'human' : 'agent'} ${open ? 'open-q' : ''}`}
                >
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
          <InputRow
            ref={inputRef}
            className="comms-input"
            value={draft}
            onValueChange={setDraft}
            onSubmit={send}
            disabled={!pending}
            placeholder={pending ? 'Answer' : ''}
          />
        </>
      )}
    </div>
  );
}
