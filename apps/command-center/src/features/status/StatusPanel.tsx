import { type NodeState, type MapSnapshot, type ActivityState, stateCounts, typeMix } from '@miloops-hq/core';
import { Label } from '../../components/ui';
import { TYPE_CODE, isWaiting } from '../../lib';

export const ORDER: [NodeState, string][] = [
  ['decided', 'Done'],
  ['claimed', 'Working'],
  ['frontier', 'Ready'],
  ['blocked', 'Backlog'],
  ['parked', 'Parked'],
  ['out-of-scope', 'Cancelled'],
];

/** Shown once a mission verifies completions, or while any ticket is in one of these states. */
const VERIFY_ORDER: [NodeState, string][] = [
  ['verifying', 'Verifying'],
  ['rework', 'Rework'],
  ['held', 'Blocked'],
];

/** Mission status counters (also the map legend) and the type mix. */
export function StatusPanel({ snap, sessions }: { snap: MapSnapshot; sessions: ActivityState['sessions'] }) {
  const c = stateCounts(snap);
  const n = (s: NodeState) => c[s];
  const waiting = sessions.filter(isWaiting).length;
  const mix = typeMix(snap);
  const mixMax = Math.max(1, ...mix.map((m) => m.open + m.closed));
  const verifies = (snap.map.verification ?? 'off') !== 'off' || VERIFY_ORDER.some(([s]) => n(s));
  const rows = verifies ? [...ORDER.slice(0, 2), ...VERIFY_ORDER, ...ORDER.slice(2)] : ORDER;
  return (
    <div className="status-panel">
      <div className="sp-col sp-status">
        <div className="sp-head">
          <Label as="h3">Status</Label>
          <span className="mono-label">{c.total} tickets</span>
        </div>
        <ul>
          {rows.map(([s, label]) => (
            <li key={s} className={`st-${s} ${n(s) ? '' : 'zero'}`}>
              <i />
              <span>{label}</span>
              <b>{String(n(s)).padStart(2, '0')}</b>
            </li>
          ))}
          <li className={`st-waiting ${waiting ? '' : 'zero'}`}>
            <i />
            <span>Waiting on you</span>
            <b>{String(waiting).padStart(2, '0')}</b>
          </li>
        </ul>
      </div>
      <div className="sp-block sp-col">
        <span className="mono-label">Type mix</span>
        <ul className="mix">
          {mix.map((m) => (
            <li key={m.type} title={`${m.type}: ${m.closed} closed, ${m.open} open`}>
              <span className="mono-label xs">{TYPE_CODE[m.type]}</span>
              <span className="mix-bar">
                <i className="closed" style={{ width: `${(m.closed / mixMax) * 100}%` }} />
                <i className="open" style={{ width: `${(m.open / mixMax) * 100}%` }} />
              </span>
              <b>{m.open + m.closed}</b>
            </li>
          ))}
        </ul>
      </div>
      <div className="legend-extra mono-label">
        <span>● HITL</span>
        <span>○ AFK</span>
      </div>
    </div>
  );
}
