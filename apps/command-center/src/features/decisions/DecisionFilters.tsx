import {
  type DecisionFilter,
  type AuditDecision,
  type MapSnapshot,
  type DecisionSourceKind,
  DECISION_SOURCE_KINDS,
  DECISION_SOURCES,
  type DecisionStatus,
} from '@miloops-hq/core';
import { DecisionOption } from './DecisionOption';

export function DecisionFilters(props: {
  filter: DecisionFilter;
  set: (p: Partial<DecisionFilter>) => void;
  all: AuditDecision[];
  missions: MapSnapshot[];
  people: string[];
  compact: boolean;
}) {
  const { filter, set, all } = props;
  const count = (f: (d: AuditDecision) => boolean) => all.filter(f).length;
  if (props.compact)
    return (
      <div className="dv-filters compact">
        <select
          className="mono"
          value={filter.mapId ?? ''}
          onChange={(e) => set({ mapId: e.target.value || undefined })}
          aria-label="Mission"
        >
          <option value="">All missions</option>
          {props.missions.map((s) => (
            <option key={s.map.id} value={s.map.id}>
              {s.map.key} {s.map.title}
            </option>
          ))}
        </select>
        <select
          className="mono"
          value={filter.source ?? ''}
          onChange={(e) => set({ source: (e.target.value || undefined) as DecisionSourceKind | undefined })}
          aria-label="Source"
        >
          <option value="">All sources</option>
          {DECISION_SOURCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {DECISION_SOURCES[k].label}
            </option>
          ))}
        </select>
        <select
          className="mono"
          value={filter.decidedBy ?? ''}
          onChange={(e) => set({ decidedBy: e.target.value || undefined })}
          aria-label="Decided by"
        >
          <option value="">Anyone</option>
          {props.people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          className="mono"
          value={filter.status ?? ''}
          onChange={(e) => set({ status: (e.target.value || undefined) as DecisionStatus | undefined })}
          aria-label="Status"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="superseded">Superseded</option>
        </select>
      </div>
    );
  return (
    <aside className="dv-filters">
      <h3 className="mono-label">Mission</h3>
      <ul>
        <DecisionOption
          on={!filter.mapId}
          label="All missions"
          n={all.length}
          onClick={() => set({ mapId: undefined })}
        />
        {props.missions.map((s) => (
          <DecisionOption
            key={s.map.id}
            on={filter.mapId === s.map.id}
            label={`${s.map.key} ${s.map.title}`}
            n={count((d) => d.mapId === s.map.id)}
            onClick={() => set({ mapId: s.map.id })}
          />
        ))}
      </ul>
      <h3 className="mono-label">Source</h3>
      <ul>
        <DecisionOption on={!filter.source} label="All" n={all.length} onClick={() => set({ source: undefined })} />
        {DECISION_SOURCE_KINDS.map((k) => (
          <DecisionOption
            key={k}
            cls={`src-${k}`}
            on={filter.source === k}
            label={DECISION_SOURCES[k].label}
            n={count((d) => d.source.kind === k)}
            onClick={() => set({ source: filter.source === k ? undefined : k })}
          />
        ))}
      </ul>
      <h3 className="mono-label">Decided by</h3>
      <ul>
        <DecisionOption
          on={!filter.decidedBy}
          label="Anyone"
          n={all.length}
          onClick={() => set({ decidedBy: undefined })}
        />
        {props.people.map((p) => (
          <DecisionOption
            key={p}
            on={filter.decidedBy === p}
            label={p}
            n={count((d) => d.decidedBy === p)}
            onClick={() => set({ decidedBy: filter.decidedBy === p ? undefined : p })}
          />
        ))}
      </ul>
      <h3 className="mono-label">Status</h3>
      <ul>
        <DecisionOption on={!filter.status} label="Any" n={all.length} onClick={() => set({ status: undefined })} />
        <DecisionOption
          on={filter.status === 'active'}
          label="Active"
          n={count((d) => !d.supersededBy)}
          onClick={() => set({ status: filter.status === 'active' ? undefined : 'active' })}
        />
        <DecisionOption
          on={filter.status === 'superseded'}
          label="Superseded"
          n={count((d) => !!d.supersededBy)}
          onClick={() => set({ status: filter.status === 'superseded' ? undefined : 'superseded' })}
        />
      </ul>
    </aside>
  );
}
