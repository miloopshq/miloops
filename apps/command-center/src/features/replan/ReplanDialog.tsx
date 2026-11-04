import type { MapSnapshot } from '@miloops-hq/core';
import { useEffect, useState } from 'react';
import { Button, Empty, Field, Panel } from '../../components/ui';
import { ago } from '../../lib';
import { ReplanChangeRow } from './ReplanChangeRow';
import { ReplanDestination } from './ReplanDestination';
import { ticketNamer } from './ticketNamer';
import type { ReplanView } from './types';

/**
 * Review a replan proposal: why, the evidence, the assumptions it invalidates, every change and the tickets it
 * freezes. Approve applies all of it; reject needs a note the agent gets. Nothing changes until one is clicked.
 */
export function ReplanDialog(props: {
  replan: ReplanView;
  snap: MapSnapshot;
  error?: string;
  onApprove: (note: string) => void;
  onReject: (note: string) => void;
  onClose: () => void;
}) {
  const { replan: p, snap } = props;
  const [note, setNote] = useState('');
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [props]);
  const name = ticketNamer(snap, p.changes);
  const assumptions = snap.map.sections.assumptions ?? [];
  const invalidated = p.invalidates.map((id) => assumptions.find((a) => a.id === id) ?? { id, text: '' });
  const pending = p.status === 'pending';
  const challenge = p.kind === 'challenge-destination';
  return (
    <div className="scrim" onClick={props.onClose}>
      <Panel as="div" className="dialog replan-dialog" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 className="t-heading caps">{challenge ? 'Destination challenged' : 'Replan proposal'}</h2>
          <span className="mono-label">
            {p.id} · {p.status} · by {p.by} · {ago(Date.now() - p.at)} ago
          </span>
        </header>
        <div className="replan-body">
          {challenge && <ReplanDestination reason={p.destinationReason} destination={p.diff?.destination} />}
          <section>
            <h3 className="mono-label">Why</h3>
            <p>{p.reason}</p>
          </section>
          <section>
            <h3 className="mono-label">Evidence</h3>
            <p className="replan-evidence">{p.evidence}</p>
          </section>
          {invalidated.length > 0 && (
            <section>
              <h3 className="mono-label">Assumptions it invalidates</h3>
              <ul className="brief-list">
                {invalidated.map((a) => (
                  <li key={a.id}>
                    <span className="key">{a.id}</span> {a.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 className="mono-label">Changes · {p.changes.length}</h3>
            <ul className="replan-changes">
              {p.changes.map((c, i) => (
                <ReplanChangeRow key={i} change={c} name={name} />
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mono-label">Frozen until you decide</h3>
            {p.frozen?.length ? <p>{p.frozen.map(name).join(', ')}</p> : <Empty>No tickets frozen</Empty>}
          </section>
          {p.note && (
            <section>
              <h3 className="mono-label">Your note</h3>
              <p>{p.note}</p>
            </section>
          )}
        </div>
        {pending && (
          <Field label="Note for the agent (required to reject)">
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        )}
        {props.error && <p className="urgent-text">{props.error}</p>}
        <div className="actions">
          {pending && (
            <>
              <Button className="replan-reject" disabled={!note.trim()} onClick={() => props.onReject(note.trim())}>
                Reject
              </Button>
              <Button className="replan-approve" variant="primary" onClick={() => props.onApprove(note.trim())}>
                Approve and apply
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={props.onClose}>
            Close
          </Button>
        </div>
      </Panel>
    </div>
  );
}
