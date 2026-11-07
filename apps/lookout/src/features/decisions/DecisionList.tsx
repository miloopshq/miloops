import type { DecisionRecord, MapSnapshot } from '@teamtrail/core';
import { Empty } from '../../components/ui';
import { day } from '../../lib';
import { DecisionRow } from './DecisionRow';

/** The filtered decisions, newest first, with a day divider whenever the date changes. */
export function DecisionList(props: {
  rows: DecisionRecord[];
  current?: DecisionRecord;
  snaps: Record<string, MapSnapshot>;
  showTrail: boolean;
  onSelect: (id: string) => void;
}) {
  const { rows, current } = props;
  return (
    <ol className="dv-list" aria-label="Logbook">
      {rows.length ? (
        rows.map((d, i) => (
          <DecisionRow
            key={`${d.mapId}:${d.id}`}
            d={d}
            newDay={i === 0 || day(rows[i - 1].decidedAt) !== day(d.decidedAt)}
            trail={props.snaps[d.mapId]?.map.key}
            on={current?.id === d.id && current.mapId === d.mapId}
            showTrail={props.showTrail}
            onClick={() => props.onSelect(d.id)}
          />
        ))
      ) : (
        <Empty>No decisions</Empty>
      )}
    </ol>
  );
}
