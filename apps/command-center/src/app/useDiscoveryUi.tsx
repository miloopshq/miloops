import type { MapSnapshot } from '@miloops-hq/core';
import { useState } from 'react';
import { BriefDialog, BriefInboxCard, DiscoveryBanner, useBrief } from '../features/discovery';

/** The discovery step's UI pieces for the current mission: map banner, Communication card and the review dialog. */
export function useDiscoveryUi(snap?: MapSnapshot) {
  const d = useBrief(snap);
  const [open, setOpen] = useState(false);
  const review = () => setOpen(true);
  const b = d.brief;
  const s = b?.sections;
  return {
    briefText: s ? [s.existing, s.conventions, s.dataModel, s.api].join('\n') : '',
    banner: b && <DiscoveryBanner brief={b} onReview={review} />,
    inboxCard: b && <BriefInboxCard brief={b} onReview={review} />,
    dialog: b && open && (
      <BriefDialog
        brief={b}
        error={d.error}
        onAccept={() => void d.accept().then((ok) => ok && setOpen(false))}
        onRequestChanges={(note) => void d.requestChanges(note).then((ok) => ok && setOpen(false))}
        onClose={() => setOpen(false)}
      />
    ),
  };
}
