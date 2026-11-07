import { Badge } from '../components/ui';
import type { PhoneTab } from './tabs';

const TABS: [PhoneTab, string][] = [
  ['home', 'Inbox'],
  ['map', 'Map'],
  ['ticket', 'Ticket'],
  ['activity', 'Activity'],
  ['plan', 'Plan'],
];

/** Fixed bottom tab bar on phones; the inbox tab carries the waiting-on-you count. */
export function PhoneTabBar(props: {
  tab: PhoneTab;
  covered: boolean;
  pending: number;
  onPick: (tab: PhoneTab) => void;
}) {
  const { tab, covered, pending } = props;
  return (
    <nav className="tabbar">
      {TABS.map(([id, label]) => (
        <button key={id} className={tab === id && !covered ? 'on' : ''} onClick={() => props.onPick(id)}>
          {label}
          {id === 'home' && pending > 0 && <Badge key={pending} n={pending} urgent pop />}
        </button>
      ))}
    </nav>
  );
}
