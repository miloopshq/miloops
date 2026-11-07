import type { MapMode } from '@teamtrail/core';
import { Choice } from '../../components/ui';

export function ModeChoice(props: { value: MapMode; onChange: (m: MapMode) => void }) {
  const opts: { v: MapMode; title: string }[] = [
    { v: 'plan+execute', title: 'Plan + execute' },
    { v: 'plan-only', title: 'Plan only' },
  ];
  return (
    <div className="choice-row">
      {opts.map((o) => (
        <Choice key={o.v} on={props.value === o.v} title={o.title} onClick={() => props.onChange(o.v)} />
      ))}
    </div>
  );
}
