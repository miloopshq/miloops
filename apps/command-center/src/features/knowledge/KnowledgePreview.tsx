import { pathsIn, selectKnowledge, type MapSnapshot, type Ticket } from '@miloops-hq/core';
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
    <div className="kn-preview">
      <span
        className="mono-label"
        data-tip="Picked by paths, words, mission and kind; confirmed entries and assumptions only"
      >
        Knowledge this agent gets · {picked.length}
      </span>
      {picked.length > 0 && (
        <ul>
          {picked.map((p) => (
            <li key={p.id}>
              <button className="link" onClick={() => k.setOpen(true)} data-tip={p.why.join(' · ')}>
                {p.id}
              </button>{' '}
              {p.title}
              {p.status === 'assumption' && <span className="dim"> (assumption)</span>}
              {p.mayBeOutdated && <span className="kn-warn"> · may be outdated</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
