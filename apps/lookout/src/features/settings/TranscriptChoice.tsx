import type { HitlTranscriptMode } from '@teamtrail/core';
import { Choice } from '../../components/ui';

export function TranscriptChoice(props: { value: HitlTranscriptMode; onChange: (v: HitlTranscriptMode) => void }) {
  const opts: { v: HitlTranscriptMode; title: string }[] = [
    { v: 'summary', title: 'Summary' },
    { v: 'full', title: 'Full transcript' },
  ];
  return (
    <div className="choice-row">
      {opts.map((o) => (
        <Choice key={o.v} on={props.value === o.v} title={o.title} onClick={() => props.onChange(o.v)} />
      ))}
    </div>
  );
}
