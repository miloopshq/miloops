import type { ReplanChange } from '@miloops-hq/core';
import { describeChange } from './replanText';

/** One change of a proposal: a tag with what kind of change it is, the change, and why or how. */
export function ReplanChangeRow({ change, name }: { change: ReplanChange; name: (idOrRef: string) => string }) {
  const t = describeChange(change, name);
  return (
    <li className={`replan-change op-${change.op}`}>
      <span className="replan-op mono-label">{t.verb}</span>
      <span className="replan-change-text">
        {t.text}
        {t.detail && <span className="replan-change-detail">{t.detail}</span>}
      </span>
    </li>
  );
}
