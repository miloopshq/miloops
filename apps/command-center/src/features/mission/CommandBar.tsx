import { useEffect, useState } from 'react';
import { InfoTip, Label, ZoneIcon } from '../../components/ui';
import { AgentCommand } from './AgentCommand';

/** Rotating hints: the agent-chat commands people need most, plus how to move around the map. */
const HINTS: { text: string; command?: string }[] = [
  { text: 'Agents pick up ready work from their chat', command: '/milo resume' },
  { text: 'Answer what is waiting on you from the chat', command: '/milo inbox' },
  { text: 'Ask MILO where the mission stands', command: '/milo status' },
  { text: 'Start the next mission from your agent', command: '/milo new "your idea"' },
  { text: 'Click a ticket to zoom in. Scroll or pinch to zoom, drag to pan, Fit to see it all' },
];
const ROTATE_MS = 9000;

/** The map zone's title row. Agents work from their own chat; MILOOPS never starts an agent itself. */
export function CommandBar() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setI((n) => (n + 1) % HINTS.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused]);
  const h = HINTS[i];
  return (
    <div className="command-bar real">
      <ZoneIcon name="map" />
      <Label as="h2" className="zone-title-label">
        Mission map
      </Label>
      <InfoTip text="Every decision ticket in this mission and what blocks what. Click a ticket to see it in Mission step. The strip below sums up progress." />
      <div
        className="hint"
        key={i}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <span className="dim">{h.text}</span>
        {h.command && <AgentCommand command={h.command} />}
      </div>
      <button
        type="button"
        className="link hint-next"
        data-tip="Next hint"
        aria-label="Next hint"
        onClick={() => setI((n) => (n + 1) % HINTS.length)}
      >
        {i + 1}/{HINTS.length} ›
      </button>
    </div>
  );
}
