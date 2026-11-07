import { NewTrailDialog } from '../features/trail';
import { createTrail, type Runtime } from '../lib';

/** New trail: create it here (any agent picks it up with /scout resume), or draft /scout new for the agent's chat. */
export function AppNewTrail(props: { rt: Runtime; onClose: () => void; onCreated: (mapId: string) => void }) {
  return (
    <NewTrailDialog
      onClose={props.onClose}
      tracker={props.rt.adapter.label}
      onCreate={async (input) => {
        const map = await createTrail(props.rt.adapter, input);
        props.onCreated(map.id);
        return map;
      }}
    />
  );
}
