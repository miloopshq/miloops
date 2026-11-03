import type { DecisionRecord, Comment } from '@miloops-hq/core';
import { Meta } from '../../components/ui';

/** The ticket's resolution (or rule-out) comment, with a link to its decision and the chain length. */
export function ResolutionNote({
  resolution,
  decisions,
  onOpenDecision,
}: {
  resolution: Comment;
  decisions: DecisionRecord[];
  onOpenDecision?: (id: string) => void;
}) {
  const decision = decisions.find((d) => !d.supersededBy) ?? decisions[0];
  const kind = resolution.body.startsWith('**Ruled') ? 'ruled out' : 'resolution';
  const chain = decisions.length > 1 ? ` · ${decisions.length} in chain` : '';
  return (
    <div className="resolution">
      <div className="res-head">
        <Meta parts={[resolution.author, kind]} />
        {decision && onOpenDecision && (
          <button className="link" onClick={() => onOpenDecision(decision.id)}>
            {decision.id}
            {chain} ›
          </button>
        )}
      </div>
      <p>{resolution.body.replace(/^\*\*[^*]+\*\*\s*/, '')}</p>
    </div>
  );
}
