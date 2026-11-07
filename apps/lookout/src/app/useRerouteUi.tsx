import type { MapSnapshot } from '@teamtrail/core';
import { useState } from 'react';
import { mapPreview } from '../features/map';
import { RerouteBanner, RerouteDialog, useReroutes } from '../features/reroute';

/**
 * The reroute pieces for the current trail: the map banner while a proposal is pending, the preview drawn over the
 * map (the open proposal, else the pending one), the review dialog, and `openReroute` for other zones (attention).
 */
export function useRerouteUi(snap?: MapSnapshot, selectMap?: (mapId: string) => void) {
  const r = useReroutes(snap);
  const [openId, setOpenId] = useState<string>();
  const shown = r.reroutes.find((p) => p.id === openId);
  const previewed = shown?.diff ? shown : r.pending;
  const close = () => {
    setOpenId(undefined);
    r.clearError();
  };
  const closeIf = (ok: boolean) => ok && close();
  return {
    banner: r.pending && <RerouteBanner reroute={r.pending} onReview={() => setOpenId(r.pending?.id)} />,
    preview: snap && previewed?.diff ? mapPreview(snap, previewed.diff, previewed.frozen) : undefined,
    /** Opens a proposal's review, switching to its trail first when it's another one. */
    openReroute: (mapId: string, id: string) => {
      if (mapId !== snap?.map.id) selectMap?.(mapId);
      setOpenId(id);
    },
    dialog: snap && shown && (
      <RerouteDialog
        reroute={shown}
        snap={snap}
        error={r.error}
        onApprove={(note) => void r.approve(shown.id, note || undefined).then(closeIf)}
        onReject={(note) => void r.reject(shown.id, note).then(closeIf)}
        onClose={close}
      />
    ),
  };
}
