import type { ReplanChange } from '@miloops-hq/core';
import { MetaLine, Row } from '../../components/ui';
import { describeChange } from './replanText';

/** Changes that take work away: amber, so they stand out from additions and edits. */
const AT_RISK = new Set<ReplanChange['op']>(['cancel_ticket', 'update_destination']);

/** One change of a proposal as a row: the change as the title, what kind of change it is, and why or how. */
export function ReplanChangeRow({ change, name }: { change: ReplanChange; name: (idOrRef: string) => string }) {
  const t = describeChange(change, name);
  return (
    <Row
      as="li"
      className={`replan-change op-${change.op}`}
      edge={AT_RISK.has(change.op) ? 'attention' : 'neutral'}
      title={t.text}
      titleText={t.text}
      context={<MetaLine parts={[{ text: t.verb, strong: true }]} />}
      detail={t.detail}
      detailText={t.detail}
    />
  );
}
