import type { ActivityState, MapSnapshot } from '@miloops-hq/core';
import { useState } from 'react';
import { Empty, EmptyState, Panel, SectionHeader, Tabs } from '../../components/ui';
import type { Selection } from '../../lib';
import { MissionReport } from './MissionReport';

export type Tab = 'unspecified' | 'decisions' | 'oos' | 'notes' | 'report';

/** Map body sections ("the plan"): a static list per section, one tab each. */
export function MapSections({
  snap,
  selection,
  onSelect,
  bare,
  onAudit,
  activity,
}: {
  snap?: MapSnapshot;
  selection: Selection;
  onSelect: (s: Selection) => void;
  bare?: boolean;
  onAudit?: () => void;
  activity?: ActivityState;
}) {
  const [tab, setTab] = useState<Tab>('unspecified');
  const s = snap?.map.sections;
  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: 'unspecified', label: 'Not yet specified', n: s?.unspecified.length },
    { id: 'decisions', label: 'Decisions', n: s?.decisions.length },
    { id: 'oos', label: 'Out of scope', n: s?.outOfScope.length },
    { id: 'notes', label: 'Notes' },
    { id: 'report', label: 'Report' },
  ];
  const body =
    !s || !snap ? (
      <EmptyState
        title="No plan yet"
        hint="Open questions, decisions, what's ruled out, notes and the mission report collect here."
      />
    ) : tab === 'report' ? (
      activity ? (
        <MissionReport snap={snap} activity={activity} onTicket={(id) => onSelect({ kind: 'ticket', id })} />
      ) : (
        <Empty>No activity yet</Empty>
      )
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
      {!bare && (
        <SectionHeader
          className="zone-title"
          title="Mission plan"
          info="The parts of the plan that aren't tickets yet: open questions still to specify, decisions already made, what's ruled out, and notes. Report shows how the mission is going: lead times, your interventions, rework, reviews and cost per verified ticket."
        />
      )}
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
