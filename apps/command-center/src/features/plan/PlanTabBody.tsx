import type { ActivityState, MapSnapshot } from '@miloops-hq/core';
import { Empty } from '../../components/ui';
import type { Selection } from '../../lib';
import { MissionReport } from './MissionReport';
import type { Tab } from './types';

/** The open tab of the mission plan: one list per map section, or the report. */
export function PlanTabBody({
  tab,
  snap,
  selection,
  onSelect,
  activity,
}: {
  tab: Tab;
  snap: MapSnapshot;
  selection: Selection;
  onSelect: (s: Selection) => void;
  activity?: ActivityState;
}) {
  const s = snap.map.sections;
  switch (tab) {
    case 'report':
      if (!activity) return <Empty>No activity yet</Empty>;
      return <MissionReport snap={snap} activity={activity} onTicket={(id) => onSelect({ kind: 'ticket', id })} />;
    case 'decisions':
      if (!s.decisions.length) return <Empty>None</Empty>;
      return (
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
      );
    case 'unspecified':
      if (!s.unspecified.length) return <Empty>None</Empty>;
      return (
        <ul className="list unspecified">
          {s.unspecified.map((f) => (
            <li key={f} className={selection?.kind === 'unspecified' && selection.item === f ? 'sel' : ''}>
              <button onClick={() => onSelect({ kind: 'unspecified', item: f })}>{f}</button>
            </li>
          ))}
        </ul>
      );
    case 'oos':
      if (!s.outOfScope.length) return <Empty>None</Empty>;
      return (
        <ul className="list oos">
          {s.outOfScope.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      );
    case 'notes':
      return <p className="notes">{s.notes || '—'}</p>;
    default: {
      const unknown: never = tab;
      return unknown;
    }
  }
}
