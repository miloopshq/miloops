import { NewMissionDialog } from '../features/mission';
import type { CommandCenterApi } from '../hooks';
import type { Runtime } from '../lib';

/** New mission: charted by a simulated agent in the demo; drafts the /milo new command on real trackers. */
export function AppNewMission(props: { api: CommandCenterApi; rt: Runtime; onClose: () => void }) {
  return (
    <NewMissionDialog
      onClose={props.onClose}
      onSubmit={props.api.actions.chart}
      tracker={props.rt.adapter.label}
      simulated={props.api.simulated}
    />
  );
}
