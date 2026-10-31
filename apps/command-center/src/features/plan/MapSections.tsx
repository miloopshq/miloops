import type { MapSnapshot } from '@miloops-hq/core';
import { useState } from 'react';
import { Empty, Panel, Tabs } from '../../components/ui';
import type { Selection } from '../../lib';

export type Tab = 'unspecified' | 'decisions' | 'oos' | 'notes';

/** Map body sections ("the plan"): a static list per section, one tab each. */
export function MapSections({
  snap,
  selection,
  onSelect,
  bare,
  onAudit,
}: {
  snap?: MapSnapshot;
  selection: Selection;
  onSelect: (s: Selection) => void;
  bare?: boolean;
  onAudit?: () => void;
}) {
  const [tab, setTab] = useState<Tab>('unspecified');
  const s = snap?.map.sections;
  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: 'unspecified', label: 'Not yet specified', n: s?.unspecified.length },
    { id: 'decisions', label: 'Decisions', n: s?.decisions.length },
    { id: 'oos', label: 'Out of scope', n: s?.outOfScope.length },
    { id: 'notes', label: 'Notes' },
  ];
  const body = !s ? (
    <Empty>No mission</Empty>
  ) : tab === 'decisions' ? (
    s.decisions.length ? (
      <ol className="list decisions">
        {[...s.decisions].reverse().map((d, i) => (
          <li key={`${d.ticketKey}-${i}`}>
            <button onClick={() => d.ticketId && onSelect({ kind: 'ticket', id: d.ticketId })}>
              <span className="key">{d.ticketKey}</span>
              <span>{d.text}</span>
            </button>
          </li>
        ))}
      </ol>
    ) : (
      <Empty>None</Empty>
    )
  ) : tab === 'unspecified' ? (
    s.unspecified.length ? (
      <ul className="list unspecified">
        {s.unspecified.map((f) => (
          <li key={f} className={selection?.kind === 'unspecified' && selection.item === f ? 'sel' : ''}>
            <button onClick={() => onSelect({ kind: 'unspecified', item: f })}>{f}</button>
          </li>
        ))}
      </ul>
    ) : (
      <Empty>None</Empty>
    )
  ) : tab === 'oos' ? (
    s.outOfScope.length ? (
      <ul className="list oos">
        {s.outOfScope.map((o) => (
          <li key={o}>{o}</li>
        ))}
      </ul>
    ) : (
      <Empty>None</Empty>
    )
  ) : (
    <p className="notes">{s.notes || '—'}</p>
  );
  return (
    <Panel className={`zone sections ${bare ? 'bare' : ''}`} style={bare ? undefined : { gridArea: 'plan' }}>
      <div className="sections-tabs">
        <Tabs className="sub" value={tab} onChange={setTab} items={tabs} />
        {tab === 'decisions' && onAudit && (
          <button className="link" onClick={onAudit}>
            Audit ›
          </button>
        )}
      </div>
      <div className="zone-b">{body}</div>
    </Panel>
  );
}
