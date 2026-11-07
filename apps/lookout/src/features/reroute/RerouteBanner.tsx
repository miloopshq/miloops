import { Button, InfoTip } from '../../components/ui';
import type { RerouteView } from './types';

/** Slim banner over the map while a reroute proposal waits for the trail lead; opens the review dialog. */
export function RerouteBanner({ reroute, onReview }: { reroute: RerouteView; onReview: () => void }) {
  const challenge = reroute.kind === 'challenge-destination';
  const frozen = reroute.frozen?.length ?? 0;
  const what = challenge ? 'wrong mountain?' : 'proposes a new plan';
  const freezes = frozen ? ` ${frozen} ticket${frozen === 1 ? ' is' : 's are'} closed until you decide.` : '';
  const rest = `${reroute.reason.replace(/\.$/, '')}.${freezes}`;
  return (
    <div className="reroute-banner map-banner edge-attention" role="status" title={rest}>
      <span className="mb-text">
        <span className="mb-lead">
          {reroute.by} {what}
        </span>
        <span className="t-meta">{rest}</span>
      </span>
      <InfoTip text="An agent found that an assumption or the plan no longer holds and proposes changes. The map shows them: dashed outlines are tickets it adds, struck ones it cancels, ❄ marks tickets frozen until you approve or reject. Nothing changes until you decide." />
      <Button size="sm" variant="primary" onClick={onReview}>
        Review
      </Button>
    </div>
  );
}
