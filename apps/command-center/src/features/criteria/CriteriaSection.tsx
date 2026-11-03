import { pathsIn, selectKnowledge, uncoveredRules, type MapSnapshot, type Ticket } from '@miloops-hq/core';
import { Button } from '../../components/ui';
import { useKnowledge } from '../knowledge';
import { useCriteria } from './useCriteria';

/** In the inspector: what "done" means for this ticket, the operator's confirm, and business rules nothing covers. */
export function CriteriaSection({ snap, t }: { snap: MapSnapshot; t: Ticket }) {
  const { tickets, confirm } = useCriteria(snap.map.id);
  const k = useKnowledge();
  const entry = tickets.find((x) => x.ticketId === t.id);
  const criteria = entry?.criteria ?? [];
  const rules = selectKnowledge(k.entries, {
    missionKey: snap.map.key,
    ticket: { type: t.type, title: t.title, body: t.body },
    paths: pathsIn(`${t.body}\n${k.briefText}`),
  }).filter((r) => r.kind === 'business-rule');
  const uncovered = rules.filter((r) => uncoveredRules(criteria, [r.id]).length);
  if (!criteria.length && !uncovered.length) return null;
  return (
    <div className="criteria-section">
      <span
        className="mono-label"
        data-tip="Agreed before the work starts; each needs evidence before the ticket counts as done"
      >
        Acceptance criteria · {criteria.length}
        {entry?.confirmed && <span className="ok-text"> · confirmed by you</span>}
      </span>
      {criteria.length > 0 && (
        <ul className="criteria-list">
          {criteria.map((c) => (
            <li key={c.id}>
              <span className="key">{c.id}</span> <span className="kind">{c.kind.replace('-', ' ')}</span> {c.text}
              {c.source && <span className="dim"> ({c.source})</span>}
            </li>
          ))}
        </ul>
      )}
      {uncovered.length > 0 && (
        <p className="urgent-text crit-uncovered">
          Rules no criterion covers yet: {uncovered.map((r) => `${r.id} ${r.title}`).join('; ')}
        </p>
      )}
      {criteria.length > 0 && t.state === 'open' && (
        <Button
          size="sm"
          variant={entry?.confirmed ? 'ghost' : 'default'}
          data-tip={
            entry?.confirmed ? 'Take your confirmation back' : 'Agree that these criteria define done for this ticket'
          }
          onClick={() =>
            void confirm({ title: snap.map.title, ticketId: t.id, ticketKey: t.key, confirmed: !entry?.confirmed })
          }
        >
          {entry?.confirmed ? 'Unconfirm' : 'Confirm criteria'}
        </Button>
      )}
    </div>
  );
}
