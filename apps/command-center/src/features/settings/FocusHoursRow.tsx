import type { FocusHours } from '@miloops-hq/core';
import { Button } from '../../components/ui';

const DEFAULT_FOCUS: FocusHours = { from: '18:00', to: '09:00' };

/** Daily quiet hours: nothing interrupts in between; the queue keeps everything. */
export function FocusHoursRow(props: { focus?: FocusHours; onChange: (focus?: FocusHours) => void }) {
  const on = props.focus !== undefined;
  const focus = props.focus ?? DEFAULT_FOCUS;
  return (
    <div className="att-settings-row set-field">
      <span className="set-field-label">Quiet hours</span>
      <Button size="sm" on={on} aria-pressed={on} onClick={() => props.onChange(on ? undefined : DEFAULT_FOCUS)}>
        {on ? 'On' : 'Off'}
      </Button>
      {on && (
        <>
          <input
            type="time"
            aria-label="Quiet from"
            value={focus.from}
            onChange={(e) => e.target.value && props.onChange({ ...focus, from: e.target.value })}
          />
          <span className="t-meta">to</span>
          <input
            type="time"
            aria-label="Quiet until"
            value={focus.to}
            onChange={(e) => e.target.value && props.onChange({ ...focus, to: e.target.value })}
          />
        </>
      )}
    </div>
  );
}
