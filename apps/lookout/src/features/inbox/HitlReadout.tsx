import { type ActivityState, hitlStats } from '@teamtrail/core';
import { Readout } from '../../components/ui';
import { useNow } from '../../hooks';
import { dur } from '../../lib';

/**
 * The inbox column: HITL questions waiting on the trail lead (oldest first) and the
 * conversation for the selected one. `split` shows both stacked; `stack` (phones)
 * shows the list, then the conversation with a back button.
 */
/** `metrics.hitl`: age of the oldest open question and the average time questions waited on you. */
export function HitlReadout({ activity }: { activity: ActivityState }) {
  const now = useNow(1000);
  const h = hitlStats(activity);
  return (
    <div className="hitl-readout">
      <Readout
        layout="inline"
        label="Oldest"
        value={h.oldestAt ? dur(now - h.oldestAt) : '—'}
        urgent={!!h.oldestAt && now - h.oldestAt > 60_000}
        title="Oldest open question"
      />
      <Readout
        layout="inline"
        label="Avg wait"
        value={h.avgWaitMs !== undefined ? dur(h.avgWaitMs) : '—'}
        title={`Average wait over ${h.answered} answered questions`}
      />
      <Readout layout="inline" label="Answered" value={h.answered} />
    </div>
  );
}
