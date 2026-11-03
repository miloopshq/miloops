import { type MapSnapshot, type ActivityState, deriveStates, type NodeState, attention } from '@miloops-hq/core';
import { SectionHeader, Empty } from '../../components/ui';
import { type Selection, STATE_TEXT, isWaiting } from '../../lib';

/** Layer 3: the tickets that can move now (frontier) or are moving (claimed), as a compact list. */
export function UpNext(props: {
  snap?: MapSnapshot;
  sessions: ActivityState['sessions'];
  selection: Selection;
  onSelect: (s: Selection) => void;
}) {
  const { snap } = props;
  const states = snap ? deriveStates(snap.tickets, snap.map.mode) : new Map<string, NodeState>();
  const rank: Partial<Record<NodeState, number>> = { claimed: 0, frontier: 1 };
  const items = (snap?.tickets ?? [])
    .filter((t) => rank[states.get(t.id)!] !== undefined)
    .sort((a, b) => rank[states.get(a.id)!]! - rank[states.get(b.id)!]!);
  const waiting = new Set(props.sessions.filter(isWaiting).map((s) => s.ticketId));
  const selId = props.selection?.kind === 'ticket' ? props.selection.id : undefined;
  return (
    <div className="upnext">
      <SectionHeader title="Up next" count={<span className="n mono-label">{items.length}</span>} />
      {!snap && <Empty>Ready tickets show here</Empty>}
      {snap && !items.length && <Empty>Nothing ready</Empty>}
      {snap && items.length > 0 && (
        <ul className="ticket-list">
          {items.map((t) => {
            const st = states.get(t.id)!;
            let stateText = STATE_TEXT[st].toLowerCase();
            if (waiting.has(t.id)) stateText = 'waiting';
            else if (st === 'claimed') stateText = t.assignee ?? '';
            return (
              <li key={t.id} className={`${selId === t.id ? 'sel' : ''} st-${waiting.has(t.id) ? 'waiting' : st}`}>
                <button onClick={() => props.onSelect({ kind: 'ticket', id: t.id })}>
                  <i className="dot" />
                  <span className="key">{t.key}</span>
                  <span className="ttl">{t.title}</span>
                  <span className="human">{attention(t) === 'hitl' ? '●' : '○'}</span>
                  <span className="st-text">{stateText}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
