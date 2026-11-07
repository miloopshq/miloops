import { Button } from '../../components/ui';
import { useNight } from '../../hooks';

const SUN =
  'M6 0h2v2H6zM6 12h2v2H6zM0 6h2v2H0zM12 6h2v2h-2zM2 2h2v2H2zM10 2h2v2h-2zM2 10h2v2H2zM10 10h2v2h-2zM4 4h6v6H4z';
const MOON = 'M5 0h4v1H7v1H6v2H5v4h1v2h1v1h4v1h-1v1H9v1H5v-1H3v-1H2v-1H1V9H0V5h1V3h1V2h1V1h2z';

/** Switches between the day and night themes. Settings also offers "Match my system". */
export function ThemeToggle({ onToggle }: { onToggle: (night: boolean) => void }) {
  const night = useNight();
  const label = night ? 'Switch to the day theme' : 'Switch to the night theme';
  return (
    <Button variant="ghost" className="icon-only" aria-label={label} data-tip={label} onClick={() => onToggle(!night)}>
      <svg viewBox="0 0 14 14" width="14" height="14" shapeRendering="crispEdges" aria-hidden="true">
        <path d={night ? SUN : MOON} fill="currentColor" />
      </svg>
    </Button>
  );
}
