import { type ActivityState, type MapSnapshot, STEPS } from '@miloops-hq/core';
import { Empty } from '../../components/ui';
import { featured } from './featured';

const STATUS = { running: 'Working', done: 'Done', failed: 'Stopped' } as const;

/** The latest step an agent reported, in words ("claude-01 · work, step 3 of 5" / "Resolve #6" / the ticket),
 * with the step pipeline underneath. */
export function StepTracker({ activity, snap }: { activity: ActivityState; snap?: MapSnapshot }) {
  const s = featured(activity);
  if (!s) return <Empty>No session yet</Empty>;
  const t = s.ticketId ? snap?.tickets.find((x) => x.id === s.ticketId) : undefined;
  const steps = STEPS[s.mode];
  const status = s.waitingOn ? 'Waiting on you' : STATUS[s.status];
  return (
    <div className={`step-tracker ${s.waitingOn ? 'waiting' : ''}`}>
      <div className="st-meta">
        <span className="mono-label">
          <span className="callsign">{s.agent}</span> · {s.mode}, step {s.step} of {s.total}
        </span>
        <span className={`mono-label st-status ${s.waitingOn ? 'urgent' : s.status}`}>{status}</span>
      </div>
      <div className="st-big">
        {s.stepLabel}
        {t && <span className="st-key"> {t.key}</span>}
      </div>
      {t && <div className="st-ticket">{t.title}</div>}
      <ol className="pipeline">
        {steps.map((label, i) => {
          const n = i + 1;
          const cls = n < s.step || (n === s.step && s.status === 'done') ? 'done' : n === s.step ? 'cur' : '';
          return (
            <li key={label} className={cls}>
              <i />
              <span>
                {String(n).padStart(2, '0')} {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
