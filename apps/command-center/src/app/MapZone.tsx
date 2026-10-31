import { Panel, Button } from '../components/ui';
import { MapGraph } from '../features/map';
import { CommandBar } from '../features/mission';
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
            selection={selection}
            onSelect={props.onSelect}
            minFit={props.minFit}
          />
        ) : (
          <div className="nomap">
            <h2>No mission</h2>
            <div className="actions">
              <Button variant="primary" onClick={props.onNewMission}>
                New mission
              </Button>
              <Button onClick={actions.loadSample}>Load sample mission</Button>
            </div>
          </div>
        )}
        {snap && props.compact && <Legend planOnly={snap.map.mode === 'plan-only'} />}
      </div>
    </Panel>
  );
}
