import { useEffect, useState } from 'react';
import { DEFAULT_MAP_MODE, frontier, type MapMode } from '@miloops-hq/core';
import type { CommandCenterApi } from '../useCommandCenter';
import { MiloMark } from './MiloMark';

export function CommandBar({ api }: { api: CommandCenterApi }) {
  const { snap, actions } = api;
  const hasFrontier = !!snap && frontier(snap.tickets, snap.map.mode).length > 0;
  return (
    <div className="command-bar">
      <button className="btn primary" onClick={() => actions.work()} disabled={!hasFrontier}>
        <MiloMark variant="action" size={14} />
        Work next
      </button>
      <button className={`toggle ${api.autopilot ? 'on' : ''}`} onClick={actions.toggleAutopilot}>
        <i /> Autopilot
      </button>
    </div>
  );
}

export function ModeChoice(props: { value: MapMode; onChange: (m: MapMode) => void }) {
  const opts: { v: MapMode; title: string }[] = [
    { v: 'plan+execute', title: 'Plan + execute' },
    { v: 'plan-only', title: 'Plan only' },
  ];
  return (
    <div className="choice-row">
      {opts.map((o) => (
        <button key={o.v} type="button" className={`choice ${props.value === o.v ? 'on' : ''}`} onClick={() => props.onChange(o.v)}>
          <b>{o.title}</b>
        </button>
      ))}
    </div>
  );
}

export function NewMissionDialog({ onClose, onSubmit, tracker }: { onClose: () => void; onSubmit: (t: string, d: string, m: MapMode, notes: string) => void; tracker: string }) {
  const [mode, setMode] = useState<MapMode>(DEFAULT_MAP_MODE);
  const [title, setTitle] = useState('Ship team workspaces');
  const [notes, setNotes] = useState('');
  const [dest, setDest] = useState('Teams can share notebooks with role-based access, and admins can manage members without contacting support.');
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <form
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(title, dest, mode, notes);
          onClose();
        }}
      >
        <header>
          <h2>New mission</h2>
        </header>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label>
          Destination
          <textarea rows={3} value={dest} onChange={(e) => setDest(e.target.value)} />
        </label>
        <label>
          Notes
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label>Mode</label>
        <ModeChoice value={mode} onChange={setMode} />
        <div className="fact-row">
          <span className="dim">Tracker</span> {tracker}
        </div>
        <footer>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            <MiloMark variant="action" size={14} />
            Launch
          </button>
        </footer>
      </form>
    </div>
  );
}
