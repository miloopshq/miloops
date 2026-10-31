import { type DecisionFilter, filterDecisions, decisionStats, BRAND, decisionsToMarkdown } from '@miloops-hq/core';
import { useState, useEffect, useMemo } from 'react';
import { Panel, Label, Button, Empty } from '../../components/ui';
import { type CommandCenterApi, type Breakpoint } from '../../hooks';
import { download, day } from '../../lib';
import { DecisionDetail } from './DecisionDetail';
import { DecisionFilters } from './DecisionFilters';
import { DecisionReadouts } from './DecisionReadouts';
import { DecisionRow } from './DecisionRow';

/**
 * Decisions audit: every decision across missions, newest first. Covers the
 * zones under the header without moving them; the header stays in place.
 */
export function DecisionsView(props: {
  api: CommandCenterApi;
  bp: Breakpoint;
  focus?: string;
  onClose: () => void;
  onOpenTicket: (mapId: string, ticketId: string) => void;
}) {
  const { api, bp } = props;
  const all = api.decisions;
  const [filter, setFilter] = useState<DecisionFilter>({});
  const [sel, setSel] = useState<string | undefined>(props.focus);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => setSel(props.focus), [props.focus]);
  useEffect(() => {
    const k = (e: KeyboardEvent) =>
      e.key === 'Escape' && (bp === 'mobile' && sel ? setSel(undefined) : props.onClose());
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [bp, sel, props]);

  const rows = useMemo(() => filterDecisions(all, filter), [all, filter]);
  const stats = useMemo(() => decisionStats(all), [all]);
  const current =
    all.find((d) => d.id === sel && (!filter.mapId || d.mapId === filter.mapId)) ??
    (bp === 'mobile' ? undefined : rows[0]);
  const missions = useMemo(
    () => Object.values(api.allSnaps).sort((a, b) => b.map.createdAt - a.map.createdAt),
    [api.allSnaps],
  );
  const people = useMemo(() => [...new Set(all.map((d) => d.decidedBy))].sort(), [all]);
  const set = (patch: Partial<DecisionFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const exportMd = () => {
    const ms = Object.fromEntries(missions.map((s) => [s.map.id, { key: s.map.key, title: s.map.title }]));
    download(
      `${BRAND.slug}-decisions-${day(Date.now())}.md`,
      decisionsToMarkdown(rows, ms, { title: `${BRAND.name} decisions` }),
    );
  };
  const active = Object.values(filter).filter(Boolean).length;
  const detailOnly = bp === 'mobile' && !!current;

  return (
    <Panel className={`zone decisions-view dv-${bp}`}>
      <header className="dv-head">
        {detailOnly ? (
          <button className="back" onClick={() => setSel(undefined)}>
            ‹ Decisions
          </button>
        ) : (
          <Label as="h2">
            Decisions {rows.length !== all.length && <span className="n">{`${rows.length}/${all.length}`}</span>}
          </Label>
        )}
        {bp !== 'mobile' && <DecisionReadouts stats={stats} />}
        <span className="dv-head-right">
          {!detailOnly && (
            <Button onClick={exportMd} disabled={!rows.length} title="Export the filtered list as markdown">
              Export .md
            </Button>
          )}
          <button className="icon-btn" onClick={props.onClose} aria-label="Close">
            ×
          </button>
        </span>
      </header>

      {!detailOnly && (
        <div className="dv-search">
          <input
            type="search"
            placeholder="Search decisions"
            value={filter.query ?? ''}
            onChange={(e) => set({ query: e.target.value })}
          />
          {bp !== 'wide' && (
            <button
              className={`chip ${filtersOpen || active > (filter.query ? 1 : 0) ? 'on' : ''}`}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              Filters{active - (filter.query ? 1 : 0) > 0 ? ` · ${active - (filter.query ? 1 : 0)}` : ''}
            </button>
          )}
        </div>
      )}

      <div className="dv-body">
        {(bp === 'wide' || (filtersOpen && !detailOnly)) && (
          <DecisionFilters
            filter={filter}
            set={set}
            all={all}
            missions={missions}
            people={people}
            compact={bp !== 'wide'}
          />
        )}
        {!detailOnly && (
          <ol className="dv-list" aria-label="Decisions">
            {rows.length ? (
              rows.map((d, i) => (
                <DecisionRow
                  key={`${d.mapId}:${d.id}`}
                  d={d}
                  newDay={i === 0 || day(rows[i - 1].decidedAt) !== day(d.decidedAt)}
                  mission={api.allSnaps[d.mapId]?.map.key}
                  on={current?.id === d.id && current.mapId === d.mapId}
                  showMission={bp === 'wide'}
                  onClick={() => setSel(d.id)}
                />
              ))
            ) : (
              <Empty>No decisions</Empty>
            )}
          </ol>
        )}
        {bp !== 'mobile' || current ? (
          <div className="dv-detail">
            {current ? (
              <DecisionDetail
                d={current}
                all={all}
                snap={api.allSnaps[current.mapId]}
                onSelect={setSel}
                onOpenTicket={props.onOpenTicket}
                onSupersede={api.actions.supersede}
              />
            ) : (
              <Empty>No decision selected</Empty>
            )}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
