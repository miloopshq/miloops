import { Panel, Button } from '../components/ui';
import { MapGraph } from '../features/map';
import { AgentCommand, CommandBar } from '../features/mission';
import { StatusPanel } from '../features/status';
import type { CommandCenterApi } from '../hooks';
import { type Selection, startDemo } from '../lib';
import { Legend } from './Legend';

export function MapZone(props: {
  api: CommandCenterApi;
  sessions: CommandCenterApi['activity']['sessions'];
  onSelect: (s: Selection) => void;
  onNewMission: () => void;
  compact: boolean;
  minFit: number;
}) {
  const { snap, selection, actions } = props.api;
  return (
    <Panel as="main" className="zone map-zone" style={{ gridArea: 'map' }}>
      {snap && <CommandBar api={props.api} />}
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
            <h2>No mission</h2>
            {props.api.simulated ? (
              <div className="actions">
                <Button variant="primary" onClick={props.onNewMission}>
                  New mission
                </Button>
                <Button onClick={actions.loadSample}>Load sample mission</Button>
              </div>
            ) : (
              <>
                <p className="nomap-lede">
                  Missions start in your agent's chat. MILO frames the idea with you, then charts it here.
                </p>
                <AgentCommand command='/milo new "your idea"' />
                <div className="actions">
                  <Button onClick={props.onNewMission} data-tip="Write the idea here and copy the command">
                    Draft the command…
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={startDemo}
                    data-tip="A ready-made mission with simulated agents. Nothing is saved"
                  >
                    Explore the demo
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        {snap && props.compact && (
          <Legend planOnly={snap.map.mode === 'plan-only'} verifies={(snap.map.verification ?? 'off') !== 'off'} />
        )}
      </div>
    </Panel>
  );
}
