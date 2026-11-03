import { type MapSnapshot, allowedTypes, type TicketType, FLEXIBLE_ATTENTION } from '@miloops-hq/core';
import { useState, useEffect, type FormEvent } from 'react';
import { Pill, Card, Field, Button } from '../../components/ui';
import type { CommandCenterApi } from '../../hooks';

export function UnspecifiedDetail({ snap, item, api }: { snap: MapSnapshot; item: string; api: CommandCenterApi }) {
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
        <Pill tone="state" className="st-unspecified">
          Not yet specified
        </Pill>
      </div>
      <h3 className="t-heading">{item}</h3>
      <Card
        as="form"
        tone="inset"
        className="inline-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void api.actions.graduate({ unspecified: item, type, title, blockedBy, hitl });
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
