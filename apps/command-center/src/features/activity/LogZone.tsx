import { Zone } from '../../components/ui';
import { ActivityLog } from './ActivityLog';
import type { ZoneProps } from './types';

/** Wide: the activity log zone. */
export function LogZone(props: ZoneProps) {
  return (
    <Zone
      area="log"
      className="log-zone"
      icon="book"
      title="Activity log"
      info="Everything that happened in this mission, newest first: claims, steps, questions, decisions and errors."
      right={<span className="mono-label dim">{props.activity.feed.length} events</span>}
    >
      <ActivityLog activity={props.activity} onTicket={props.onTicket} />
    </Zone>
  );
}
