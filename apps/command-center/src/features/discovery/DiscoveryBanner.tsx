import type { DiscoveryBrief } from '@miloops-hq/core';
import { Button, InfoTip } from '../../components/ui';

const TEXT: Record<DiscoveryBrief['status'], string> = {
  draft: 'Discovery: an agent investigates the existing system before anything is built. Waiting for the brief.',
  submitted: 'Discovery brief ready for your review. Implementation starts once you accept it.',
  'changes-requested': 'Discovery: you asked for changes. Waiting for the revised brief.',
  accepted: 'Discovery brief accepted.',
};

/** Slim banner over the map while a mission's discovery step is open. */
export function DiscoveryBanner({ brief, onReview }: { brief: DiscoveryBrief; onReview: () => void }) {
  if (brief.status === 'accepted') return null;
  return (
    <div className={`discovery-banner st-${brief.status}`} role="status">
      <span className="mono-label">Discovery</span>
      <span className="db-text">{TEXT[brief.status]}</span>
      <InfoTip text="Before implementation, an agent maps the existing system: the files involved, conventions, data and API impact, risks and assumptions. You accept the brief or ask for changes; task, execute and prototype tickets can't be claimed until you accept it." />
      <Button size="sm" variant={brief.status === 'submitted' ? 'primary' : 'ghost'} onClick={onReview}>
        {brief.status === 'submitted' ? 'Review brief' : 'Open brief'}
      </Button>
    </div>
  );
}
