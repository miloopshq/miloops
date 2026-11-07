import { Badge } from '@teamtrail/scout-avatar';
import { useNight } from '../../hooks';

/** Scout's small badge, next to text: wherever a line is in Scout's voice, or an empty state has nothing to show. */
export function ScoutBadge({ className, size = 18 }: { className?: string; size?: number }) {
  return (
    <span className={className} aria-hidden="true">
      <Badge size={size} variant={useNight() ? 'night' : 'crt'} />
    </span>
  );
}
