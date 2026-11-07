import type { MapSnapshot } from '@teamtrail/core';
import { useDiscoveryUi } from './useDiscoveryUi';
import { useRerouteUi } from './useRerouteUi';

/**
 * Everything the current trail shows beyond its tickets: the discovery step (banner, Communication card, brief
 * review) and reroutes (banner, map preview, review). Banners and dialogs come combined, so zones place them once.
 */
export function useTrailUi(snap?: MapSnapshot, selectMap?: (mapId: string) => void) {
  const discovery = useDiscoveryUi(snap);
  const reroute = useRerouteUi(snap, selectMap);
  return {
    briefText: discovery.briefText,
    inboxCard: discovery.inboxCard,
    review: discovery.review,
    banner: (
      <>
        {discovery.banner}
        {reroute.banner}
      </>
    ),
    preview: reroute.preview,
    openReroute: reroute.openReroute,
    dialog: (
      <>
        {discovery.dialog}
        {reroute.dialog}
      </>
    ),
  };
}
