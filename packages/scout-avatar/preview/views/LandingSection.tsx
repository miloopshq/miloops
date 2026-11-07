import { ScoutAvatar, type ScoutStyleId } from '../../src/scout';
import { LINES } from '../content';

export function LandingSection({ variant }: { variant: ScoutStyleId }) {
  return (
    <section className="landing">
      <div className="landing-copy">
        <div className="eyebrow">Trail Intelligence &amp; Logistics Operator</div>
        <h3>Meet Scout</h3>
        <p>
          Scout runs the trail while you stay on the decisions. It plans the work, briefs your agents, and pings you
          only when a call is yours to make.
        </p>
        <ul>
          <li>
            <b>Plans</b> trails from your repo and tracker
          </li>
          <li>
            <b>Briefs</b> every agent session it launches
          </li>
          <li>
            <b>Asks</b> only when a decision needs you
          </li>
        </ul>
      </div>
      <ScoutAvatar variant={variant} size="lg" speaking={LINES.plan} at={2300} />
    </section>
  );
}
