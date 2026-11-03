import type { DiscoveryBrief } from '@miloops-hq/core';
import { Card } from '../../components/ui';

/** A submitted brief waits on the operator like a question does: shown at the top of the Communication zone. */
export function BriefInboxCard({ brief, onReview }: { brief: DiscoveryBrief; onReview: () => void }) {
  if (brief.status !== 'submitted') return null;
  return (
    <div className="brief-card">
      <Card as="button" tone="urgent" onClick={onReview}>
        <span className="row1">
          <span className="who">{brief.author ?? 'Agent'}</span>
          <span className="tag">Discovery brief</span>
        </span>
        <span className="q t-title">Discovery brief ready for your review</span>
        <span className="ttl">{brief.sections.summary.split('\n')[0]}</span>
      </Card>
    </div>
  );
}
