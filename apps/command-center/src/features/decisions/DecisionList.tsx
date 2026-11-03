import type { DecisionRecord, MapSnapshot } from '@miloops-hq/core';
import { Empty } from '../../components/ui';
import { day } from '../../lib';
import { DecisionRow } from './DecisionRow';

/** The filtered decisions, newest first, with a day divider whenever the date changes. */
export function DecisionList(props: {
  rows: DecisionRecord[];
  current?: DecisionRecord;
  snaps: Record<string, MapSnapshot>;
  showMission: boolean;
  onSelect: (id: string) => void;
}) {
  const { rows, current } = props;
  return (
    <ol className="dv-list" aria-label="Decisions">
      {rows.length ? (
        rows.map((d, i) => (
          <DecisionRow
            key={`${d.mapId}:${d.id}`}
            d={d}
            newDay={i === 0 || day(rows[i - 1].decidedAt) !== day(d.decidedAt)}
            mission={props.snaps[d.mapId]?.map.key}
            on={current?.id === d.id && current.mapId === d.mapId}
            showMission={props.showMission}
            onClick={() => props.onSelect(d.id)}
          />
        ))
      ) : (
        <Empty>No decisions</Empty>
      )}
    </ol>
  );
}
