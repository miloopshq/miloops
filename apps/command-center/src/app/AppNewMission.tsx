import { NewMissionDialog } from '../features/mission';
import type { Runtime } from '../lib';

/** New mission: drafts the /milo new command for the operator's agent, which frames and charts it. */
export function AppNewMission(props: { rt: Runtime; onClose: () => void }) {
  return <NewMissionDialog onClose={props.onClose} tracker={props.rt.adapter.label} />;
}
