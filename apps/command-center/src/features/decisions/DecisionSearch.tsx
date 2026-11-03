import type { DecisionFilter } from '@miloops-hq/core';

/** The search box, plus a Filters toggle (with how many are set) where the filters don't fit beside the list. */
export function DecisionSearch(props: {
  filter: DecisionFilter;
  set: (patch: Partial<DecisionFilter>) => void;
  showToggle: boolean;
  filtersOpen: boolean;
  onToggle: () => void;
}) {
  const { filter } = props;
  const active = Object.values(filter).filter(Boolean).length;
  /** Filters set besides the search box. */
  const extraFilters = active - (filter.query ? 1 : 0);
  const on = props.filtersOpen || extraFilters > 0;
  return (
    <div className="dv-search">
      <input
        type="search"
        placeholder="Search decisions"
        value={filter.query ?? ''}
        onChange={(e) => props.set({ query: e.target.value })}
      />
      {props.showToggle && (
        <button className={`chip ${on ? 'on' : ''}`} onClick={props.onToggle}>
          Filters{extraFilters > 0 ? ` · ${extraFilters}` : ''}
        </button>
      )}
    </div>
  );
}
