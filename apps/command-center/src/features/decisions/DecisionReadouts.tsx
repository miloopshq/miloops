import { type decisionStats, DECISION_SOURCE_KINDS, DECISION_SOURCES } from '@miloops-hq/core';
import { Readout, Pill } from '../../components/ui';

/** `metrics.decisionStats` readouts. */
export function DecisionReadouts({ stats }: { stats: ReturnType<typeof decisionStats> }) {
  return (
    <span className="dv-readouts">
      <Readout layout="start" label="Active" value={stats.active} />
      <Readout layout="start" label="Superseded" value={stats.superseded} />
      <Readout layout="start" label="Last 24h" value={stats.last24h} />
      <Readout
        layout="start"
        label="Human"
        value={`${stats.total ? Math.round((stats.human / stats.total) * 100) : 0}%`}
      />
      <span className="dv-src-mix" title="Decisions per source">
        {DECISION_SOURCE_KINDS.filter((k) => stats.bySource[k]).map((k) => (
          <Pill key={k} className={`src-${k}`}>
            {DECISION_SOURCES[k].code} {stats.bySource[k]}
          </Pill>
        ))}
      </span>
    </span>
  );
}
