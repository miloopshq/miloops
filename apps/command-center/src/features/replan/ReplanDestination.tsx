import type { DestinationReason } from '@miloops-hq/core';
import { DESTINATION_WORDS } from './replanText';

/** A challenge to the destination: why, in plain words, and the destination before and after. */
export function ReplanDestination(props: {
  reason?: DestinationReason;
  destination?: { before: string; after: string };
}) {
  const { reason, destination } = props;
  return (
    <section className="replan-destination">
      {reason && <p className="replan-destination-why">{DESTINATION_WORDS[reason]}</p>}
      {destination && (
        <div className="replan-destination-diff">
          <div>
            <span className="mono-label">Destination now</span>
            <p className="before">{destination.before || '—'}</p>
          </div>
          <div>
            <span className="mono-label">Suggested destination</span>
            <p className="after">{destination.after}</p>
          </div>
        </div>
      )}
    </section>
  );
}
