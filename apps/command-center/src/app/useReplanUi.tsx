import type { MapSnapshot } from '@miloops-hq/core';
import { useState } from 'react';
import { mapPreview } from '../features/map';
import { ReplanBanner, ReplanDialog, useReplans } from '../features/replan';

/**
 * The replan pieces for the current mission: the map banner while a proposal is pending, the preview drawn over the
 * map (the open proposal, else the pending one), the review dialog, and `openReplan` for other zones (attention).
 */
export function useReplanUi(snap?: MapSnapshot, selectMap?: (mapId: string) => void) {
  const r = useReplans(snap);
  const [openId, setOpenId] = useState<string>();
  const shown = r.replans.find((p) => p.id === openId);
  const previewed = shown?.diff ? shown : r.pending;
  const close = () => {
    setOpenId(undefined);
    r.clearError();
  };
  const closeIf = (ok: boolean) => ok && close();
  return {
    banner: r.pending && <ReplanBanner replan={r.pending} onReview={() => setOpenId(r.pending?.id)} />,
    preview: snap && previewed?.diff ? mapPreview(snap, previewed.diff, previewed.frozen) : undefined,
    /** Opens a proposal's review, switching to its mission first when it's another one. */
    openReplan: (mapId: string, id: string) => {
      if (mapId !== snap?.map.id) selectMap?.(mapId);
      setOpenId(id);
    },
    dialog: snap && shown && (
      <ReplanDialog
        replan={shown}
        snap={snap}
        error={r.error}
        onApprove={(note) => void r.approve(shown.id, note || undefined).then(closeIf)}
        onReject={(note) => void r.reject(shown.id, note).then(closeIf)}
        onClose={close}
      />
    ),
  };
}
