import type { Assumption, MapSnapshot } from '@miloops-hq/core';
import { Button, Pill } from '../../components/ui';
import type { Selection } from '../../lib';

/** Who settled an assumption, in plain words: a replan invalidated it, or the operator confirmed it. */
function settledBy(a: Assumption) {
  if (!a.decidedBy) return undefined;
  if (a.status === 'invalidated') return `Invalidated by ${a.decidedBy}`;
  if (a.status === 'confirmed') return `Confirmed by ${a.decidedBy === 'operator' ? 'you' : a.decidedBy}`;
  return `Kept by ${a.decidedBy}`;
}

/** One assumption: status, text, the tickets that rely on it, the challenge evidence and who settled it. */
export function AssumptionRow(props: {
  a: Assumption;
  snap: MapSnapshot;
  onSelect: (s: Selection) => void;
  onConfirm?: () => void;
  busy?: boolean;
}) {
  const { a, snap } = props;
  const tickets = a.tickets.flatMap((id) => snap.tickets.filter((t) => t.id === id));
  const settled = settledBy(a);
  return (
    <li className={`assumption st-${a.status}`}>
      <div className="assumption-head">
        <Pill tone="state">{a.status}</Pill>
        <span className="key">{a.id}</span>
        <span className="assumption-text">{a.text}</span>
        {props.onConfirm && (
          <Button size="sm" variant="ghost" disabled={props.busy} onClick={props.onConfirm}>
            Confirm
          </Button>
        )}
      </div>
      {tickets.length > 0 && (
        <div className="assumption-tickets">
          Relied on by{' '}
          {tickets.map((t) => (
            <button key={t.id} className="link" onClick={() => props.onSelect({ kind: 'ticket', id: t.id })}>
              {t.key}
            </button>
          ))}
        </div>
      )}
      {a.challenge && (
        <p className="assumption-challenge">
          <span className="mono-label">Challenged by {a.challenge.by}</span> {a.challenge.evidence}
        </p>
      )}
      {settled && <p className="assumption-settled mono-label">{settled}</p>}
    </li>
  );
}
