import { frontier } from '@miloops-hq/core';
import { Button, MiloMark } from '../../components/ui';
import type { CommandCenterApi } from '../../hooks';

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
