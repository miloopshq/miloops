import type { DestinationReason } from '@teamtrail/core';
import { DESTINATION_WORDS } from './rerouteText';

/** A challenge to the destination: why, in plain words, and the destination before and after. */
export function RerouteDestination(props: {
  reason?: DestinationReason;
  destination?: { before: string; after: string };
}) {
  const { reason, destination } = props;
  return (
    <section className="reroute-destination">
      {reason && <p className="reroute-destination-why">{DESTINATION_WORDS[reason]}</p>}
      {destination && (
        <div className="reroute-destination-diff">
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
