import { Button, InfoTip } from '../../components/ui';
import type { ReplanView } from './types';

/** Slim banner over the map while a replan proposal waits for the operator; opens the review dialog. */
export function ReplanBanner({ replan, onReview }: { replan: ReplanView; onReview: () => void }) {
  const challenge = replan.kind === 'challenge-destination';
  const frozen = replan.frozen?.length ?? 0;
  const what = challenge ? 'challenges the destination' : 'proposes a new plan';
  const freezes = frozen ? ` ${frozen} ticket${frozen === 1 ? ' is' : 's are'} frozen until you decide.` : '';
  return (
    <div className="replan-banner" role="status">
      <span className="mono-label">{challenge ? 'Destination' : 'Replan'}</span>
      <span className="rb-text">
        {replan.by} {what}: {replan.reason.replace(/\.$/, '')}.{freezes}
      </span>
      <InfoTip text="An agent found that an assumption or the plan no longer holds and proposes changes. The map shows them: dashed outlines are tickets it adds, struck ones it cancels, ❄ marks tickets frozen until you approve or reject. Nothing changes until you decide." />
      <Button size="sm" variant="primary" onClick={onReview}>
        Review
      </Button>
    </div>
  );
}
