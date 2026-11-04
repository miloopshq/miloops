import type { ReactNode } from 'react';
import { KIND_PLURAL } from './attentionLabels';
import type { Batch } from './batches';

/** Questions and approvals keep the inbox's list classes, which tests and screenshots select on. */
const LIST_CLASS: Partial<Record<Batch['kind'], string>> = { question: 'inbox-list', approval: 'inbox-list approvals' };

/** Items answered in one sitting. A batch of several gets a heading: "3 questions from Reminders, answer together". */
export function BatchGroup(props: { batch: Batch; mission?: string; children: ReactNode }) {
  const { batch } = props;
  const many = batch.items.length > 1;
  const from = props.mission ? ` from ${props.mission}` : '';
  const verb = batch.kind === 'question' ? 'answer' : 'review';
  return (
    <div className={`att-batch ${many ? 'many' : ''}`}>
      {many && (
        <span className="batch-head mono-label">
          {batch.items.length} {KIND_PLURAL[batch.kind]}
          {from}, {verb} together
        </span>
      )}
      <ul className={`att-list ${LIST_CLASS[batch.kind] ?? ''}`}>{props.children}</ul>
    </div>
  );
}
