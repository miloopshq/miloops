import type { DiscoveryBrief } from '@miloops-hq/core';
import { Button, InfoTip } from '../../components/ui';

const TEXT: Record<DiscoveryBrief['status'], [string, string]> = {
  draft: ['Discovery in progress', 'An agent maps the existing system before anything is built.'],
  submitted: ['Discovery brief ready for your review', 'Implementation starts once you accept it.'],
  'changes-requested': ['You asked for changes', 'Waiting for the revised discovery brief.'],
  accepted: ['Discovery brief accepted', ''],
};

/** Slim banner over the map while a mission's discovery step is open. */
export function DiscoveryBanner({ brief, onReview }: { brief: DiscoveryBrief; onReview: () => void }) {
  if (brief.status === 'accepted') return null;
  const [lead, rest] = TEXT[brief.status];
  const edge = brief.status === 'submitted' ? 'edge-attention' : 'edge-neutral';
  return (
    <div className={`discovery-banner map-banner ${edge} st-${brief.status}`} role="status">
      <span className="mb-text">
        <span className="mb-lead">{lead}</span>
        <span className="t-meta">{rest}</span>
      </span>
      <InfoTip text="Before implementation, an agent maps the existing system: the files involved, conventions, data and API impact, risks and assumptions. You accept the brief or ask for changes; task, execute and prototype tickets can't be claimed until you accept it." />
      <Button size="sm" variant={brief.status === 'submitted' ? 'primary' : 'ghost'} onClick={onReview}>
        {brief.status === 'submitted' ? 'Review brief' : 'Open brief'}
      </Button>
    </div>
  );
}
