import { useState } from 'react';

/** A command to run in the agent's chat (Claude Code, Codex), with a copy button. Real trails start and move there. */
export function AgentCommand({ command, label = 'Copy' }: { command: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="agent-cmd">
      <code>{command}</code>
      <button
        type="button"
        className="btn sm"
        data-tip="Copy, then paste it in Claude Code or Codex"
        onClick={() =>
          void navigator.clipboard.writeText(command).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? 'Copied' : label}
      </button>
    </span>
  );
}
