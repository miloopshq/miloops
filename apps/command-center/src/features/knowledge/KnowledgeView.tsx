import { KNOWLEDGE_KINDS, type KnowledgeEntry } from '@miloops-hq/core';
import { useEffect, useMemo, useState } from 'react';
import { Empty, InfoTip, Panel, Select } from '../../components/ui';
import { useKnowledge } from './knowledgeContext';
import { KnowledgeDetail } from './KnowledgeDetail';

type Filter = 'review' | 'confirmed' | 'assumption' | 'outdated' | 'all';

/** Project knowledge: what agents get with their claims. Review suggestions, flags and stale entries here. */
export function KnowledgeView() {
  const k = useKnowledge();
  const [filter, setFilter] = useState<Filter>('review');
  const [kind, setKind] = useState('');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<string>();
  useEffect(() => {
    if (!k.open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && k.setOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [k]);
  const needsYou = (e: KnowledgeEntry) =>
    e.status === 'suggested' || !!e.flag || (!!k.stale[e.id] && e.status !== 'outdated');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return k.entries.filter(
      (e) =>
        (filter === 'all' || (filter === 'review' ? needsYou(e) : e.status === filter)) &&
        (!kind || e.kind === kind) &&
        (!q || `${e.id} ${e.title} ${e.body} ${e.tags.join(' ')}`.toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k.entries, k.stale, filter, kind, query]);
  if (!k.open) return null;
  const current = shown.find((e) => e.id === sel) ?? shown[0];
  const count = (f: Filter) =>
    k.entries.filter((e) => (f === 'all' ? true : f === 'review' ? needsYou(e) : e.status === f)).length;
  const tabs: [Filter, string][] = [
    ['review', 'Needs you'],
    ['confirmed', 'Confirmed'],
    ['assumption', 'Assumptions'],
    ['outdated', 'Outdated'],
    ['all', 'All'],
  ];
  return (
    <div className="scrim" onClick={() => k.setOpen(false)}>
      <Panel as="div" className="dialog knowledge-view" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 className="t-heading caps">Knowledge</h2>
          <InfoTip text="What agents need to know about this codebase and product. Agents propose entries; only confirmed ones and assumptions reach them, picked for each ticket with the reason. Entries about files are flagged here when those files change. Seed it from a document with: miloops knowledge import <file.md>" />
        </header>
        <div className="kn-filters">
          {tabs.map(([f, label]) => (
            <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
              {label} <span className="n">{count(f)}</span>
            </button>
          ))}
          <Select
            compact
            aria-label="Kind"
            value={kind}
            onChange={setKind}
            options={[
              { value: '', label: 'Any kind' },
              ...KNOWLEDGE_KINDS.map((x) => ({ value: x, label: x.replace('-', ' ') })),
            ]}
          />
          <input className="kn-search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="kn-body-grid">
          <ul className="list kn-list">
            {shown.length ? (
              shown.map((e) => (
                <li key={e.id} className={e === current ? 'sel' : ''}>
                  <button onClick={() => setSel(e.id)}>
                    <span className="key">{e.id}</span>
                    <span className="ttl">{e.title}</span>
                    <span className={`kn-status st-${e.status}`}>
                      {needsYou(e) && e.status !== 'suggested' ? 'check' : e.status}
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <Empty>{filter === 'review' ? 'Nothing needs you' : 'No entries'}</Empty>
            )}
          </ul>
          {current ? <KnowledgeDetail e={current} /> : <Empty>Pick an entry</Empty>}
        </div>
      </Panel>
    </div>
  );
}
