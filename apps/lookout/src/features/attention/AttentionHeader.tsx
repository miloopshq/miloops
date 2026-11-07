import type { AttentionView } from '@teamtrail/core';
import { Button, ScoutMark } from '../../components/ui';

const FOCUS_MS = 60 * 60_000;

/** Header: focus mode (an hour without interruptions) and how many items interrupt right now. */
export function AttentionHeader(props: { view: AttentionView; onFocus: (until?: number) => void }) {
  const { view } = props;
  const manual = (view.prefs.focusUntil ?? 0) > Date.now();
  const n = view.interrupting.length;
  const tip = view.focused
    ? 'Focus is on: nothing interrupts you. Everything still waits in Waiting on you. Click to end focus.'
    : 'Focus for an hour: nothing interrupts you, everything still waits in Waiting on you.';
  return (
    <span className="attention-head">
      <Button
        variant="ghost"
        className="focus-btn"
        on={view.focused}
        aria-pressed={view.focused}
        data-tip={tip}
        onClick={() => props.onFocus(manual ? undefined : Date.now() + FOCUS_MS)}
      >
        Focus
      </Button>
      {n > 0 && (
        <span className="waiting-chip interrupting" title={`${n} need you now`}>
          <ScoutMark variant="alert" size={14} />
          <b>{n}</b>
          <span className="wl">&nbsp;need you now</span>
        </span>
      )}
    </span>
  );
}
