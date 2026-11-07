import { Choice } from '../../components/ui';
import type { ThemeChoice as Theme } from '../../lib';

const OPTIONS: { value: Theme; title: string }[] = [
  { value: 'auto', title: 'Match my system' },
  { value: 'day', title: 'Day' },
  { value: 'night', title: 'Night' },
];

export function ThemeChoice(props: { value: Theme; onChange: (v: Theme) => void }) {
  return (
    <div className="choice-row compact">
      {OPTIONS.map((o) => (
        <Choice key={o.value} on={props.value === o.value} title={o.title} onClick={() => props.onChange(o.value)} />
      ))}
    </div>
  );
}
