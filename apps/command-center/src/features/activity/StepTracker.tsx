import { type ActivityState, type MapSnapshot, STEPS } from '@miloops-hq/core';
import { Empty } from '../../components/ui';
import { featured } from './featured';

/** "WORK 3/5 : RESOLVE #6" with the step pipeline underneath. */
export function StepTracker({ activity, snap }: { activity: ActivityState; snap?: MapSnapshot }) {
  const s = featured(activity);
  if (!s) return <Empty>No session yet</Empty>;
  const t = s.ticketId ? snap?.tickets.find((x) => x.id === s.ticketId) : undefined;
  const steps = STEPS[s.mode];
  const status = s.waitingOn ? 'waiting on you' : s.status;
  return (
    <div className={`step-tracker ${s.waitingOn ? 'waiting' : ''}`}>
      <div className="st-meta">
        <span className="mono-label">{s.agent}</span>
        <span className={`mono-label st-status ${s.waitingOn ? 'urgent' : s.status}`}>// {status}</span>
      </div>
      <div className="st-big">
        {s.mode} {s.step}/{s.total} : {s.stepLabel}
        {t && <span className="st-key"> {t.key}</span>}
      </div>
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
