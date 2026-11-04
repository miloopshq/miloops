import { pathsIn, selectKnowledge, type MapSnapshot, type Ticket } from '@miloops-hq/core';
import { MetaLine } from '../../components/ui';
import { useKnowledge } from './knowledgeContext';

/** In the inspector: the knowledge an agent gets when it claims this ticket, and why each entry was picked. */
export function KnowledgePreview({ snap, t }: { snap: MapSnapshot; t: Ticket }) {
  const k = useKnowledge();
  if (!k.entries.length || t.state === 'closed') return null;
  const picked = selectKnowledge(
    k.entries,
    {
      missionKey: snap.map.key,
      ticket: { type: t.type, title: t.title, body: t.body },
      paths: pathsIn(`${t.body}\n${k.briefText}`),
    },
    4000,
    (e) => k.stale[e.id] ?? [],
  );
  return (
    <div className="kn-preview d-section">
      <span
        className="t-label"
        data-tip="Picked by paths, words, mission and kind; confirmed entries and assumptions only"
      >
        Knowledge this agent gets · {picked.length}
      </span>
      {picked.length > 0 && (
        <ul className="item-list inline">
          {picked.map((p) => (
            <li key={p.id}>
              <button className="item-text kn-open" onClick={() => k.setOpen(true)} data-tip={p.why.join(' · ')}>
                {p.title}
              </button>
              <MetaLine
                parts={[
                  { text: p.id, code: true },
                  p.status === 'assumption' && 'assumption',
                  p.mayBeOutdated && { text: 'may be outdated', className: 'warn' },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
