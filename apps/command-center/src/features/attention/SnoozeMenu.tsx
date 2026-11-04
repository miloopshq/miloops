import { useState } from 'react';
import { SNOOZE_OPTIONS } from './attentionLabels';

/** A row's "later" control: snooze for a while, or set aside (fyi items and risk flags only). */
export function SnoozeMenu(props: {
  title: string;
  canDismiss: boolean;
  onSnooze: (minutes: number) => void;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pick = (act: () => void) => {
    setOpen(false);
    act();
  };
  return (
    <span className="snooze">
      <button
        type="button"
        className="snooze-btn"
        aria-expanded={open}
        aria-label={`Later: ${props.title}`}
        onClick={() => setOpen(!open)}
      >
        Later
      </button>
      {open && (
        <span className="snooze-menu" role="menu">
          {SNOOZE_OPTIONS.map((o) => (
            <button key={o.minutes} type="button" role="menuitem" onClick={() => pick(() => props.onSnooze(o.minutes))}>
              {o.label}
            </button>
          ))}
          {props.canDismiss && (
            <button type="button" role="menuitem" onClick={() => pick(props.onDismiss)}>
              Set aside
            </button>
          )}
        </span>
      )}
    </span>
  );
}
