import { useEffect, useState, type FormEvent } from 'react';
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
import { Button, Card, Field, Meta, Pill } from './ui';

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
        <Pill tone="state" className={`st-${state}`}>{STATE_TEXT[state]}</Pill>
        <span className={`meta att-${att}`}>{att === 'hitl' ? 'HITL' : 'AFK'}</span>
      </div>
      <h3 className="t-heading">{t.title}</h3>
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
          <Button variant={session.waitingOn ? 'urgent' : 'default'} onClick={() => props.onOpenChat(session.id)}>
            {session.waitingOn ? 'Answer' : 'Conversation'}
          </Button>
        )}
        {state === 'frontier' && (
          <>
            <Button variant="primary" onClick={() => actions.work(t.id)}>
              Dispatch agent
            </Button>
            <Button onClick={() => actions.claim(t.id)}>Claim</Button>
          </>
        )}
        {(state === 'frontier' || (state === 'claimed' && mine)) && (
          <Button on={form === 'resolve'} onClick={() => setForm(form === 'resolve' ? null : 'resolve')}>
            Resolve…
          </Button>
        )}
        {mine && state === 'claimed' && (
          <Button onClick={() => actions.release(t.id)}>Release</Button>
        )}
        {(state === 'frontier' || state === 'blocked' || state === 'parked') && (
          <Button variant="danger" on={form === 'rule'} onClick={() => setForm(form === 'rule' ? null : 'rule')}>
            Rule out…
          </Button>
        )}
      </div>

      {form === 'resolve' && (
        <Card
          as="form"
          tone="inset"
          className="inline-form"
          onSubmit={(e: FormEvent) => {
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
          <Field label="Resolution">
            <textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus />
          </Field>
          <Field label="Rationale">
            <input value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </Field>
          <Field label="Alternatives considered">
            <textarea rows={2} value={alternatives} onChange={(e) => setAlternatives(e.target.value)} placeholder="One per line" />
          </Field>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!answer.trim()}>
              Resolve
            </Button>
          </div>
        </Card>
      )}
      {form === 'rule' && (
        <Card
          as="form"
          tone="inset"
          className="inline-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void actions.ruleOut({ ticketId: t.id }, reason);
            setForm(null);
          }}
        >
          <Field label="Reason">
            <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              Rule out
            </Button>
          </div>
        </Card>
      )}

      {resolution && (
        <div className="resolution">
          <div className="res-head">
            <Meta parts={[resolution.author, resolution.body.startsWith('**Ruled') ? 'ruled out' : 'resolution']} />
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
          <summary className="mono-label">
            {others.length} other comment{others.length > 1 ? 's' : ''}
          </summary>
          {others.map((c) => (
            <div key={c.id} className="comment">
              <Meta parts={[c.author]} />
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
        <Pill tone="state" className="st-unspecified">Not yet specified</Pill>
      </div>
      <h3 className="t-heading">{item}</h3>
      <Card
        as="form"
        tone="inset"
        className="inline-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void api.actions.graduate(item, type, title, blockedBy, hitl);
        }}
      >
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
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
        <span className="field">Blocked by</span>
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
          <Button type="submit" variant="primary">
            Promote to ticket
          </Button>
        </div>
      </Card>
      <Card
        as="form"
        tone="inset"
        className="inline-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void api.actions.ruleOut({ unspecified: item }, reason);
        }}
      >
        <Field label="Reason">
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="form-actions">
          <Button type="submit" variant="danger">
            Rule out
          </Button>
        </div>
      </Card>
    </div>
  );
}
