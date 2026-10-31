import { type DecisionSourceKind, DECISION_SOURCES } from '@miloops-hq/core';
import { Pill } from '../../components/ui';

export function SourceTag({ kind }: { kind: DecisionSourceKind }) {
  return (
    <Pill className={`src-${kind}`} title={DECISION_SOURCES[kind].label}>
      {DECISION_SOURCES[kind].code}
    </Pill>
  );
}
