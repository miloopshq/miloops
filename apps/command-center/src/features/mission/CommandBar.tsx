import { frontier } from '@miloops-hq/core';
import { Button, MiloMark } from '../../components/ui';
import type { CommandCenterApi } from '../../hooks';

export function CommandBar({ api }: { api: CommandCenterApi }) {
  const { snap, actions } = api;
  const hasFrontier = !!snap && frontier(snap.tickets, snap.map.mode).length > 0;
  return (
    <div className="command-bar">
      <Button
        variant="primary"
        onClick={() => actions.work()}
        disabled={!hasFrontier}
        data-tip={
          hasFrontier
            ? 'Send an agent to the next ready ticket'
            : 'Nothing is ready: every open ticket is blocked or taken'
        }
      >
        <MiloMark variant="action" size={14} />
        Work next
      </Button>
      {api.autopilotAvailable && (
        <button
          className={`toggle ${api.autopilot ? 'on' : ''}`}
          onClick={actions.toggleAutopilot}
          data-tip={
            api.autopilot
              ? 'Autopilot is on: MILO keeps sending agents to ready tickets that don’t need you. Click to stop.'
              : 'Turn on Autopilot: MILO keeps sending agents to ready tickets that don’t need you'
          }
        >
          <i /> Autopilot
        </button>
      )}
    </div>
  );
}
