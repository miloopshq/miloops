import { AgentCommand } from './AgentCommand';

/** Agents work from their own chat; MILOOPS never starts an agent itself. */
export function CommandBar() {
  return (
    <div className="command-bar real">
      <span className="dim">Agents pick up ready work from their chat</span>
      <AgentCommand command="/milo resume" />
    </div>
  );
}
