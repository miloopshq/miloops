import {
  type DecisionFilter,
  type AuditDecision,
  type MapSnapshot,
  type DecisionSourceKind,
  DECISION_SOURCE_KINDS,
  DECISION_SOURCES,
  type DecisionStatus,
  madeBy,
} from '@miloops-hq/core';
import { Select } from '../../components/ui';
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
        <Select
          compact
          aria-label="Mission"
          value={filter.mapId ?? ''}
          onChange={(v) => set({ mapId: v || undefined })}
          options={[
            { value: '', label: 'All missions' },
            ...props.missions.map((s) => ({ value: s.map.id, label: `${s.map.key} ${s.map.title}` })),
          ]}
        />
        <Select<DecisionSourceKind | ''>
          compact
          aria-label="Source"
          value={filter.source ?? ''}
          onChange={(v) => set({ source: v || undefined })}
          options={[
            { value: '', label: 'All sources' },
            ...DECISION_SOURCE_KINDS.map((k) => ({ value: k, label: DECISION_SOURCES[k].label })),
          ]}
        />
        <Select
          compact
          aria-label="Decided by"
          value={filter.decidedBy ?? ''}
          onChange={(v) => set({ decidedBy: v || undefined })}
          options={[{ value: '', label: 'Anyone' }, ...props.people.map((p) => ({ value: p, label: p }))]}
        />
        <Select<DecisionStatus | ''>
          compact
          aria-label="Status"
          value={filter.status ?? ''}
          onChange={(v) => set({ status: v || undefined })}
          options={[
            { value: '', label: 'Any status' },
            { value: 'active', label: 'Active' },
            { value: 'superseded', label: 'Superseded' },
          ]}
        />
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
      <h3 className="mono-label">Made by</h3>
      <ul>
        <DecisionOption on={!filter.madeBy} label="Anyone" n={all.length} onClick={() => set({ madeBy: undefined })} />
        <DecisionOption
          on={filter.madeBy === 'agent'}
          label="Agents, on their own"
          n={count((d) => madeBy(d) === 'agent')}
          onClick={() => set({ madeBy: filter.madeBy === 'agent' ? undefined : 'agent' })}
        />
        <DecisionOption
          on={filter.madeBy === 'human'}
          label="People"
          n={count((d) => madeBy(d) === 'human')}
          onClick={() => set({ madeBy: filter.madeBy === 'human' ? undefined : 'human' })}
        />
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
