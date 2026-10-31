import { type TrackerHealth, eventPulse } from '@miloops-hq/core';
import { Bars } from '../../components/ui';

/** `metrics.eventPulse`: tracker events over the last minute; watcher/external changes highlighted. */
export function TrackerPulse({ health, now }: { health: TrackerHealth; now: number }) {
  const p = eventPulse(health, now);
  return (
    <span
      className="pulse"
      title={`${p.total} tracker events in the last minute (${p.external.reduce((a, b) => a + b, 0)} external)`}
    >
      <Bars values={p.all} hot={p.external} height={18} />
      <span className="mono-label">{p.total}/min</span>
    </span>
  );
}
