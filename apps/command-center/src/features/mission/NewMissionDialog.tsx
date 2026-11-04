import { useState, useEffect } from 'react';
import { Panel, Field, Button } from '../../components/ui';
import { AgentCommand } from './AgentCommand';

/**
 * Starts a mission two ways: Create mission charts it here (with its discovery ticket) for any agent to pick up with
 * `/milo resume`, or the `/milo new` command lets MILO frame it in the agent's chat. MILOOPS never runs an agent itself.
 */
export function NewMissionDialog({
  onClose,
  tracker,
  onCreate,
}: {
  onClose: () => void;
  tracker: string;
  onCreate: (input: { title: string; destination: string; notes: string; assumptions: string[] }) => Promise<{
    key: string;
  }>;
}) {
  const [created, setCreated] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [title, setTitle] = useState('');
  const [dest, setDest] = useState('');
  const [notes, setNotes] = useState('');
  const [assumptions, setAssumptions] = useState('');
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
        <Field label="Assumptions (optional, one per line)">
          <textarea
            className="new-mission-assumptions"
            rows={2}
            value={assumptions}
            onChange={(e) => setAssumptions(e.target.value)}
            placeholder="What the plan takes for granted, e.g. The v2 API supports batch writes"
          />
        </Field>
        <div className="agent-draft">
          <span className="dim">
            Paste this in Claude Code or Codex. MILO frames the mission with you there, then charts it here in {tracker}
            .
          </span>
          <AgentCommand command={`/milo new "${idea || 'your idea'}"`} label="Copy command" />
        </div>
        {created ? (
          <div className="agent-draft created">
            <span>
              Mission {created} is on the map, starting with discovery. To get it moving, run this in Claude Code or
              Codex:
            </span>
            <AgentCommand command="/milo resume" label="Copy command" />
          </div>
        ) : (
          error && <p className="urgent-text">{error}</p>
        )}
        <footer>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {!created && (
            <Button
              variant="primary"
              disabled={busy || !title.trim() || !dest.trim()}
              data-tip="Put the mission on the map now; any agent picks it up with /milo resume"
              onClick={() => {
                setBusy(true);
                const lines = assumptions.split('\n').map((l) => l.trim());
                onCreate({
                  title: title.trim(),
                  destination: dest.trim(),
                  notes: notes.trim(),
                  assumptions: lines.filter(Boolean),
                })
                  .then((m) => setCreated(m.key))
                  .catch((e: Error) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Create mission
            </Button>
          )}
        </footer>
      </Panel>
    </div>
  );
}
