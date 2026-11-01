import type { NodeState } from '@miloops-hq/core';
import { useState, type FormEvent } from 'react';
import { Button, Card, Field, Select } from '../../components/ui';
import type { ActionRequest, OperatorAction } from '../../lib/verification';

type Act = (req: Omit<ActionRequest, 'mapId' | 'ticketId'>) => Promise<unknown>;
type Reasoned = Extract<OperatorAction, 'accept' | 'rework' | 'unblock'>;

const FORM: Record<Reasoned, { label: string; submit: string; hint: string }> = {
  rework: { label: 'What to fix', submit: 'Send to rework', hint: 'Posted on the ticket for the next agent.' },
  accept: { label: 'Why accept', submit: 'Accept anyway', hint: 'Closes the ticket as done despite the checks.' },
  unblock: { label: 'Why', submit: 'Unblock', hint: 'Back to the queue without running checks.' },
};

/** Operator calls on a verifying or blocked ticket. Overrides need a reason, which is kept as a verdict. */
export function VerificationActions(props: { state: NodeState; submitted: boolean; running: boolean; act: Act }) {
  const [form, setForm] = useState<Reasoned>();
  const [reason, setReason] = useState('');
  const [to, setTo] = useState<'ready' | 'rework'>('rework');
  const { state, submitted, running, act } = props;
  if (running || (state !== 'verifying' && state !== 'held')) return null;
  const open = (f: Reasoned) => {
    setForm(form === f ? undefined : f);
    setReason('');
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form || !reason.trim()) return;
    void act({ action: form, reason: reason.trim(), ...(form === 'unblock' ? { to } : {}) });
    setForm(undefined);
  };
  return (
    <>
      <div className="actions vf-actions">
        {state === 'verifying' && submitted && (
          <Button variant="primary" onClick={() => void act({ action: 'approve' })}>
            Approve
          </Button>
        )}
        {submitted && <Button onClick={() => void act({ action: 'rerun' })}>Re-run checks</Button>}
        <Button on={form === 'rework'} onClick={() => open('rework')}>
          Rework…
        </Button>
        {state === 'held' && (
          <>
            <Button on={form === 'accept'} onClick={() => open('accept')}>
              Accept anyway…
            </Button>
            <Button on={form === 'unblock'} onClick={() => open('unblock')}>
              Unblock…
            </Button>
          </>
        )}
      </div>
      {form && (
        <Card as="form" tone="inset" className="inline-form" onSubmit={submit}>
          <Field label={FORM[form].label}>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
          {form === 'unblock' && (
            <Field label="Back to">
              <Select<'ready' | 'rework'>
                aria-label="Back to"
                value={to}
                onChange={setTo}
                options={[
                  { value: 'rework', label: 'Rework', hint: 'Keeps the feedback for the next agent.' },
                  { value: 'ready', label: 'Ready', hint: 'Back in the queue as a fresh ticket.' },
                ]}
              />
            </Field>
          )}
          <span className="dim vf-hint">{FORM[form].hint}</span>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setForm(undefined)}>
              Cancel
            </Button>
            <Button type="submit" variant={form === 'accept' ? 'danger' : 'primary'} disabled={!reason.trim()}>
              {FORM[form].submit}
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
