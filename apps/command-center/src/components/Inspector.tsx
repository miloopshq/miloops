import { useEffect, useState } from 'react';
import {
  allowedTypes,
  attention,
  deriveStates,
  FLEXIBLE_ATTENTION,
  label,
  type MapSnapshot,
  type NodeState,
  type SessionInfo,
  type TicketType,
} from '@miloops-hq/core';
import { OPERATOR, type CommandCenterApi } from '../useCommandCenter';
import { Empty, Zone } from './Hud';

export const STATE_TEXT: Record<NodeState, string> = {
  decided: 'Decided',
  claimed: 'Claimed',
  frontier: 'Frontier',
  blocked: 'Blocked',
  parked: 'Parked (plan-only)',
  'out-of-scope': 'Out of scope',
};

type Form = 'resolve' | 'rule' | null;

export function Inspector({
  api,
  sessions,
  bare,
  onOpenChat,
  onOpenDecision,
}: {
  api: CommandCenterApi;
  sessions: SessionInfo[];
  bare?: boolean;
  onOpenChat?: (sessionId: string) => void;
  onOpenDecision?: (id: string) => void;
}) {
  const { snap, selection, actions } = api;
  const [form, setForm] = useState<Form>(null);
  const key = selection?.kind === 'ticket' ? selection.id : selection?.kind === 'unspecified' ? selection.item : '';
  useEffect(() => setForm(null), [key]);

  return (
    <Zone area="inspector" title="Ticket" className="inspector" bare={bare}>
      {!snap || !selection ? (
        <Empty>No ticket selected</Empty>
      ) : selection.kind === 'unspecified' ? (
        <UnspecifiedDetail snap={snap} item={selection.item} api={api} />
      ) : (
        <TicketDetail snap={snap} id={selection.id} api={api} sessions={sessions} form={form} setForm={setForm} onOpenChat={onOpenChat ?? actions.openChat} onOpenDecision={onOpenDecision} />
      )}
    </Zone>
  );
}

function TicketDetail(props: {
  snap: MapSnapshot;
  id: string;
  api: CommandCenterApi;
  sessions: SessionInfo[];
  form: Form;
  setForm: (f: Form) => void;
  onOpenChat: (id: string) => void;
  onOpenDecision?: (id: string) => void;
}) {
  const { snap, api, form, setForm } = props;
  const { actions } = api;
  const [answer, setAnswer] = useState('');
  const [rationale, setRationale] = useState('');
  const [alternatives, setAlternatives] = useState('');
  const [reason, setReason] = useState('Not needed to reach the destination.');
  const t = snap.tickets.find((x) => x.id === props.id);
  if (!t) return <Empty>Ticket not found.</Empty>;
  const state = deriveStates(snap.tickets, snap.map.mode).get(t.id)!;
  const byId = new Map(snap.tickets.map((x) => [x.id, x]));
  const blocks = snap.tickets.filter((x) => x.blockedBy.includes(t.id));
  const att = attention(t);
  const session = props.sessions.find((s) => s.ticketId === t.id && s.status === 'running');
  const mine = t.assignee === OPERATOR;
  const resolution = [...t.comments].reverse().find((c) => /^\*\*(Resolution|Ruled out of scope)\*\*/.test(c.body));
  const others = t.comments.filter((c) => c !== resolution);
  const decisions = api.decisions.filter((d) => d.mapId === snap.map.id && d.ticketId === t.id);
  const decision = decisions.find((d) => !d.supersededBy) ?? decisions[0];

  return (
    <div className="detail">
      <div className="d-head">
        <span className="key">{t.key}</span>
        <span className={`state-pill st-${state}`}>{STATE_TEXT[state]}</span>
        <span className={`att-tag att-${att}`}>{att === 'hitl' ? 'HITL' : 'AFK'}</span>
      </div>
      <h3>{t.title}</h3>
      <dl className="facts">
        <dt>Type</dt>
        <dd>{label(t.type)}</dd>
        <dt>Assignee</dt>
        <dd>{t.assignee ?? '—'}</dd>
        <dt>Blocked by</dt>
        <dd>{t.blockedBy.map((b) => `${byId.get(b)?.key ?? b}${byId.get(b)?.state === 'closed' ? ' ✓' : ''}`).join(', ') || '—'}</dd>
        <dt>Blocks</dt>
        <dd>{blocks.map((b) => b.key).join(', ') || '—'}</dd>
      </dl>

      <div className="actions">
        {session && (
          <button className={`btn ${session.waitingOn ? 'urgent' : ''}`} onClick={() => props.onOpenChat(session.id)}>
            {session.waitingOn ? 'Answer' : 'Conversation'}
          </button>
        )}
        {state === 'frontier' && (
          <>
            <button className="btn primary" onClick={() => actions.work(t.id)}>
              Dispatch agent
            </button>
            <button className="btn" onClick={() => actions.claim(t.id)}>
              Claim
            </button>
          </>
        )}
        {(state === 'frontier' || (state === 'claimed' && mine)) && (
          <button className={`btn ${form === 'resolve' ? 'on' : ''}`} onClick={() => setForm(form === 'resolve' ? null : 'resolve')}>
            Resolve…
          </button>
        )}
        {mine && state === 'claimed' && (
          <button className="btn" onClick={() => actions.release(t.id)}>
            Release
          </button>
        )}
        {(state === 'frontier' || state === 'blocked' || state === 'parked') && (
          <button className={`btn danger ${form === 'rule' ? 'on' : ''}`} onClick={() => setForm(form === 'rule' ? null : 'rule')}>
            Rule out…
          </button>
        )}
      </div>

      {form === 'resolve' && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!answer.trim()) return;
            void actions.resolve(t.id, answer.trim(), {
              rationale: rationale.trim(),
              alternatives: alternatives.split('\n').map((a) => a.trim()).filter(Boolean),
            });
            setForm(null);
            setAnswer('');
            setRationale('');
            setAlternatives('');
          }}
        >
          <label>Resolution</label>
          <textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus />
          <label>Rationale</label>
          <input value={rationale} onChange={(e) => setRationale(e.target.value)} />
          <label>Alternatives considered</label>
          <textarea rows={2} value={alternatives} onChange={(e) => setAlternatives(e.target.value)} placeholder="One per line" />
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!answer.trim()}>
              Resolve
            </button>
          </div>
        </form>
      )}
      {form === 'rule' && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void actions.ruleOut({ ticketId: t.id }, reason);
            setForm(null);
          }}
        >
          <label>Reason</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
            <button className="btn danger">Rule out</button>
          </div>
        </form>
      )}

      {resolution && (
        <div className="resolution">
          <div className="dim res-head">
            {resolution.author} · {resolution.body.startsWith('**Ruled') ? 'ruled out' : 'resolution'}
            {decision && props.onOpenDecision && (
              <button className="link" onClick={() => props.onOpenDecision!(decision.id)}>
                {decision.id}
                {decisions.length > 1 ? ` · ${decisions.length} in chain` : ''} ›
              </button>
            )}
          </div>
          <p>{resolution.body.replace(/^\*\*[^*]+\*\*\s*/, '')}</p>
        </div>
      )}
      <p className="body">{t.body}</p>
      {others.length > 0 && (
        <details className="comments">
          <summary>
            {others.length} other comment{others.length > 1 ? 's' : ''}
          </summary>
          {others.map((c) => (
            <div key={c.id} className="comment">
              <div className="dim">{c.author}</div>
              <div className="c-body">{c.body.replace(/\*\*/g, '')}</div>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

function UnspecifiedDetail({ snap, item, api }: { snap: MapSnapshot; item: string; api: CommandCenterApi }) {
  const types = allowedTypes(snap.map.mode);
  const [type, setType] = useState<TicketType>('research');
  const [title, setTitle] = useState(item);
  const [hitl, setHitl] = useState(false);
  const [blockedBy, setBlockedBy] = useState<string[]>([]);
  const [reason, setReason] = useState('Not needed to reach the destination.');
  useEffect(() => setTitle(item), [item]);
  const open = snap.tickets.filter((t) => t.state === 'open');
  return (
    <div className="detail">
      <div className="d-head">
        <span className="state-pill st-unspecified">Not yet specified</span>
      </div>
      <h3>{item}</h3>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void api.actions.graduate(item, type, title, blockedBy, hitl);
        }}
      >
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="chips">
          {types.map((t) => (
            <button type="button" key={t} className={`chip ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>
              {t}
            </button>
          ))}
          {FLEXIBLE_ATTENTION.includes(type) && (
            <button type="button" className={`chip ${hitl ? 'on' : ''}`} onClick={() => setHitl((h) => !h)}>
              needs human
            </button>
          )}
        </div>
        <label>Blocked by</label>
        <div className="chips">
          {open.map((t) => (
            <button
              type="button"
              key={t.id}
              className={`chip ${blockedBy.includes(t.id) ? 'on' : ''}`}
              onClick={() => setBlockedBy((b) => (b.includes(t.id) ? b.filter((x) => x !== t.id) : [...b, t.id]))}
            >
              {t.key}
            </button>
          ))}
        </div>
        <div className="form-actions">
          <button className="btn primary">Promote to ticket</button>
        </div>
      </form>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void api.actions.ruleOut({ unspecified: item }, reason);
        }}
      >
        <label>Reason</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="form-actions">
          <button className="btn danger">Rule out</button>
        </div>
      </form>
    </div>
  );
}
