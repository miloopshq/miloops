import type { DiscoveryBrief } from '@miloops-hq/core';
import { MetaLine, Row } from '../../components/ui';

/** A submitted brief waits on the operator like a question does: shown at the top of the Communication zone. */
export function BriefInboxCard({ brief, onReview }: { brief: DiscoveryBrief; onReview: () => void }) {
  if (brief.status !== 'submitted') return null;
  return (
    <div className="brief-card">
      <Row
        edge="attention"
        title="Discovery brief ready for your review"
        context={<MetaLine parts={['Discovery brief', brief.author && `by ${brief.author}`]} />}
        detail={brief.sections.summary.split('\n')[0]}
        detailText={brief.sections.summary}
        onOpen={onReview}
      />
    </div>
  );
}
