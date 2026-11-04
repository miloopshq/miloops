import type { ReactNode } from 'react';
import { KIND_PLURAL } from './attentionLabels';
import type { Batch } from './batches';

/** Questions and approvals keep the inbox's list classes, which tests and screenshots select on. */
const LIST_CLASS: Partial<Record<Batch['kind'], string>> = { question: 'inbox-list', approval: 'inbox-list approvals' };

/** Items answered in one sitting. A batch of several gets a short label: "2 questions · answer together". */
export function BatchGroup(props: { batch: Batch; mission?: string; children: ReactNode }) {
  const { batch } = props;
  const many = batch.items.length > 1;
  const verb = batch.kind === 'question' ? 'answer together' : 'review together';
  const parts = [`${batch.items.length} ${KIND_PLURAL[batch.kind]}`, props.mission, verb].filter(Boolean);
  return (
    <div className={`att-batch ${many ? 'many' : ''}`}>
      {many && <span className="batch-head t-label">{parts.join(' · ')}</span>}
      <ul className={`att-list ${LIST_CLASS[batch.kind] ?? ''}`}>{props.children}</ul>
    </div>
  );
}
