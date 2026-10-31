import { MiloAvatar, type MiloStyleId } from '../../src/milo';
import { LINES } from '../content';

export function LandingSection({ variant }: { variant: MiloStyleId }) {
  return (
    <section className="landing">
      <div className="landing-copy">
        <div className="eyebrow">Mission Intelligence &amp; Logistics Operator</div>
        <h3>Meet MILO</h3>
        <p>
          MILO runs the mission while you stay on the decisions. It plans the work, briefs your agents, and pings you
          only when a call is yours to make.
        </p>
        <ul>
          <li>
            <b>Plans</b> missions from your repo and tracker
          </li>
          <li>
            <b>Briefs</b> every agent session it launches
          </li>
          <li>
            <b>Asks</b> only when a decision needs you
          </li>
        </ul>
      </div>
      <MiloAvatar variant={variant} size="lg" speaking={LINES.plan} at={2300} />
    </section>
  );
}
