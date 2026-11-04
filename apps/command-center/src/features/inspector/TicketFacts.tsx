import { attention, type NodeState, type Ticket } from '@miloops-hq/core';
import { Pill } from '../../components/ui';
import { STATE_TEXT, TYPE_TEXT } from '../../lib';

/**
 * The top of the ticket inspector: key, state and who it's for, the title, then only the facts that have a value
 * (an empty "Blocked by —" says nothing).
 */
export function TicketFacts({ t, state, tickets }: { t: Ticket; state: NodeState; tickets: Ticket[] }) {
  const byId = new Map(tickets.map((x) => [x.id, x]));
  const keyOf = (id: string) => byId.get(id)?.key ?? id;
  const blockedBy = t.blockedBy.map((b) => `${keyOf(b)}${byId.get(b)?.state === 'closed' ? ' ✓' : ''}`).join(', ');
  const blocks = tickets
    .filter((x) => x.blockedBy.includes(t.id))
    .map((x) => x.key)
    .join(', ');
  const facts: [string, string | undefined][] = [
    ['Type', TYPE_TEXT[t.type]],
    ['Assignee', t.assignee],
    ['Blocked by', blockedBy],
    ['Blocks', blocks],
    ['Reviews', t.reviewOf && keyOf(t.reviewOf)],
  ];
  const hitl = attention(t) === 'hitl';
  return (
    <>
      <div className="d-head">
        <span className="key t-code">{t.key}</span>
        <Pill tone="state" className={`st-${state}`}>
          {STATE_TEXT[state]}
        </Pill>
        <span className="d-att t-meta" data-tip={hitl ? 'A person takes this one' : 'An agent takes this alone'}>
          {hitl ? 'Needs a person' : 'Agent work'}
        </span>
      </div>
      <h3 className="t-heading t-pixel">{t.title}</h3>
      <dl className="facts">
        {facts
          .filter(([, v]) => v)
          .flatMap(([k, v]) => [
            <dt key={`${k}-k`} className="t-label">
              {k}
            </dt>,
            <dd key={`${k}-v`}>{v}</dd>,
          ])}
      </dl>
    </>
  );
}
