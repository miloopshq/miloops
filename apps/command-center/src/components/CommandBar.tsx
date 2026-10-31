import { useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_MAP_MODE, frontier, type MapMode } from '@miloops-hq/core';
import type { CommandCenterApi } from '../useCommandCenter';
import { MiloMark } from './MiloMark';
import { Button, Choice, Field, Panel } from './ui';

export function CommandBar({ api }: { api: CommandCenterApi }) {
  const { snap, actions } = api;
  const hasFrontier = !!snap && frontier(snap.tickets, snap.map.mode).length > 0;
  return (
    <div className="command-bar">
      <Button variant="primary" onClick={() => actions.work()} disabled={!hasFrontier}>
        <MiloMark variant="action" size={14} />
        Work next
      </Button>
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
        <Choice key={o.v} on={props.value === o.v} title={o.title} onClick={() => props.onChange(o.v)} />
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
      <Panel
        as="form"
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSubmit(title, dest, mode, notes);
          onClose();
        }}
      >
        <header>
          <h2 className="t-heading caps">New mission</h2>
        </header>
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Destination">
          <textarea rows={3} value={dest} onChange={(e) => setDest(e.target.value)} />
        </Field>
        <Field label="Notes">
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <span className="field">Mode</span>
        <ModeChoice value={mode} onChange={setMode} />
        <div className="fact-row">
          <span className="mono-label">Tracker</span> {tracker}
        </div>
        <footer>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            <MiloMark variant="action" size={14} />
            Launch
          </Button>
        </footer>
      </Panel>
    </div>
  );
}
