import { useState, useEffect } from 'react';
import { Panel, Field, Button } from '../../components/ui';
import { AgentCommand } from './AgentCommand';

/**
 * Drafts a new mission as the `/milo new` command for the operator's agent. MILO frames the idea there
 * and the agent charts it into this tracker; MILOOPS never runs an agent itself.
 */
export function NewMissionDialog({ onClose, tracker }: { onClose: () => void; tracker: string }) {
  const [title, setTitle] = useState('');
  const [dest, setDest] = useState('');
  const [notes, setNotes] = useState('');
  const idea = [title.trim(), dest.trim(), notes.trim()].filter(Boolean).join('. ').replace(/"/g, "'");
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <Panel as="div" className="dialog" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 className="t-heading caps">New mission</h2>
        </header>
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Destination">
          <textarea
            rows={3}
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            placeholder="What is true when this mission is done?"
          />
        </Field>
        <Field label="Notes">
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="agent-draft">
          <span className="dim">
            Paste this in Claude Code or Codex. MILO frames the mission with you there, then charts it here in {tracker}
            .
          </span>
          <AgentCommand command={`/milo new "${idea || 'your idea'}"`} label="Copy command" />
        </div>
        <footer>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </footer>
      </Panel>
    </div>
  );
}
