import { NewMissionDialog } from '../features/mission';
import { createMission, type Runtime } from '../lib';

/** New mission: create it here (any agent picks it up with /milo resume), or draft /milo new for the agent's chat. */
export function AppNewMission(props: { rt: Runtime; onClose: () => void; onCreated: (mapId: string) => void }) {
  return (
    <NewMissionDialog
      onClose={props.onClose}
      tracker={props.rt.adapter.label}
      onCreate={async (input) => {
        const map = await createMission(props.rt.adapter, input);
        props.onCreated(map.id);
        return map;
      }}
    />
  );
}
