import type { ReactNode } from 'react';
import { Panel, Button } from '../components/ui';
import { MapGraph } from '../features/map';
import { AgentCommand, CommandBar, FloatingMilo } from '../features/mission';
import { StatusPanel } from '../features/status';
import type { CommandCenterApi } from '../hooks';
import type { Selection } from '../lib';
import { Legend } from './Legend';

export function MapZone(props: {
  api: CommandCenterApi;
  sessions: CommandCenterApi['activity']['sessions'];
  onSelect: (s: Selection) => void;
  onNewMission: () => void;
  compact: boolean;
  minFit: number;
  /** Shown under the title bar, above the map (the discovery banner). */
  banner?: ReactNode;
}) {
  const { snap, selection } = props.api;
  return (
    <Panel as="main" className="zone map-zone" style={{ gridArea: 'map' }}>
      {snap && <CommandBar />}
      {props.banner}
      <div className="map-area">
        {snap && !props.compact && <StatusPanel snap={snap} sessions={props.sessions} />}
        {snap ? (
          <MapGraph
            snap={snap}
            sessions={props.sessions}
            leases={props.api.leases}
            selection={selection}
            onSelect={props.onSelect}
            minFit={props.minFit}
          />
        ) : (
          <div className="nomap">
            <FloatingMilo />
            <h2>No mission</h2>
            <p className="nomap-lede">
              Describe your idea and create the mission here, or start it in your agent's chat. MILO frames it with you,
              then your agents get to work.
            </p>
            <div className="actions">
              <Button
                variant="primary"
                onClick={props.onNewMission}
                data-tip="Describe the idea and create the mission"
              >
                New mission…
              </Button>
            </div>
            <AgentCommand command='/milo new "your idea"' />
          </div>
        )}
        {snap && props.compact && (
          <Legend planOnly={snap.map.mode === 'plan-only'} verifies={(snap.map.verification ?? 'off') !== 'off'} />
        )}
      </div>
    </Panel>
  );
}
