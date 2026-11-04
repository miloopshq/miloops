import type { MapSnapshot } from '@miloops-hq/core';
import { useDiscoveryUi } from './useDiscoveryUi';
import { useReplanUi } from './useReplanUi';

/**
 * Everything the current mission shows beyond its tickets: the discovery step (banner, Communication card, brief
 * review) and replans (banner, map preview, review). Banners and dialogs come combined, so zones place them once.
 */
export function useMissionUi(snap?: MapSnapshot, selectMap?: (mapId: string) => void) {
  const discovery = useDiscoveryUi(snap);
  const replan = useReplanUi(snap, selectMap);
  return {
    briefText: discovery.briefText,
    inboxCard: discovery.inboxCard,
    banner: (
      <>
        {discovery.banner}
        {replan.banner}
      </>
    ),
    preview: replan.preview,
    openReplan: replan.openReplan,
    dialog: (
      <>
        {discovery.dialog}
        {replan.dialog}
      </>
    ),
  };
}
