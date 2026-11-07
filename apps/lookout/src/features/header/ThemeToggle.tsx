import { Button } from '../../components/ui';
import { useNight } from '../../hooks';

const SUN = (
  <>
    <circle cx="9" cy="9" r="3.6" fill="currentColor" />
    <path
      d="M9 1v2.400M9 14.600V17M1 9h2.400M14.6 9H17M3.3 3.300L5 5M13 13l1.7 1.700M3.3 14.700L5 13M13 5l1.7-1.7"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </>
);
const MOON = <path d="M15.2 11.400A6.9 6.9 0 0 1 6.6 2.800a6.9 6.9 0 1 0 8.6 8.600z" fill="currentColor" />;

/** Switches between the day and night themes. Settings also offers "Match my system". */
export function ThemeToggle({ onToggle }: { onToggle: (night: boolean) => void }) {
  const night = useNight();
  const label = night ? 'Switch to the day theme' : 'Switch to the night theme';
  return (
    <Button variant="ghost" className="icon-only" aria-label={label} data-tip={label} onClick={() => onToggle(!night)}>
      <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
        {night ? SUN : MOON}
      </svg>
    </Button>
  );
}
