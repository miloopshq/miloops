import { type MapMode, DEFAULT_MAP_MODE } from '@miloops-hq/core';
import { useState, useEffect, type FormEvent } from 'react';
import { Panel, Field, Button, MiloMark } from '../../components/ui';
import { AgentCommand } from './AgentCommand';
import { ModeChoice } from './ModeChoice';

export function NewMissionDialog({
  onClose,
  onSubmit,
  tracker,
  simulated,
}: {
  onClose: () => void;
  onSubmit: (t: string, d: string, m: MapMode, notes: string) => void;
  tracker: string;
  /** Demo: a simulated agent charts the mission. Real: the dialog drafts the /milo new command for your agent. */
  simulated: boolean;
}) {
  const [mode, setMode] = useState<MapMode>(DEFAULT_MAP_MODE);
  const [title, setTitle] = useState(simulated ? 'Ship team workspaces' : '');
  const [notes, setNotes] = useState('');
  const [dest, setDest] = useState(
    simulated
      ? 'Teams can share notebooks with role-based access, and admins can manage members without contacting support.'
      : '',
  );
  const idea = [title.trim(), dest.trim(), notes.trim()].filter(Boolean).join('. ').replace(/"/g, "'");
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
          if (!simulated) return;
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
        {simulated ? (
          <>
            <span className="field">Mode</span>
            <ModeChoice value={mode} onChange={setMode} />
            <div className="fact-row">
              <span className="mono-label">Tracker</span> {tracker}
            </div>
          </>
        ) : (
          <div className="agent-draft">
            <span className="dim">
              Paste this in Claude Code or Codex. MILO frames the mission with you there, then charts it here in{' '}
              {tracker}.
            </span>
            <AgentCommand command={`/milo new "${idea || 'your idea'}"`} label="Copy command" />
          </div>
        )}
        <footer>
          <Button variant="ghost" onClick={onClose}>
            {simulated ? 'Cancel' : 'Close'}
          </Button>
          {simulated && (
            <Button type="submit" variant="primary">
              <MiloMark variant="action" size={14} />
              Launch
            </Button>
          )}
        </footer>
      </Panel>
    </div>
  );
}
