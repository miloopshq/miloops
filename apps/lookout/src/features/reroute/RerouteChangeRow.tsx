import type { RerouteChange } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';
import { describeChange } from './rerouteText';

/** Changes that take work away: amber, so they stand out from additions and edits. */
const AT_RISK = new Set<RerouteChange['op']>(['cancel_ticket', 'update_destination']);

/** One change of a proposal as a row: the change as the title, what kind of change it is, and why or how. */
export function RerouteChangeRow({ change, name }: { change: RerouteChange; name: (idOrRef: string) => string }) {
  const t = describeChange(change, name);
  return (
    <Row
      as="li"
      className={`reroute-change op-${change.op}`}
      edge={AT_RISK.has(change.op) ? 'attention' : 'neutral'}
      title={t.text}
      titleText={t.text}
      context={<MetaLine parts={[{ text: t.verb, strong: true }]} />}
      detail={t.detail}
      detailText={t.detail}
    />
  );
}
