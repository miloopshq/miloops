import type { VerificationVerdict } from '@miloops-hq/core';
import { MetaLine } from '../../components/ui';
import { hhmm } from '../../lib';

const TEXT = { PASS: 'Passed', FAIL: 'Sent back', NEEDS_HUMAN: 'Needs you' } as const;

/** A review or operator decision on an attempt, with its findings. */
export function ReviewVerdict({ verdict: v }: { verdict: VerificationVerdict }) {
  return (
    <div className={`vf-verdict v-${v.verdict.toLowerCase()}`}>
      <MetaLine
        parts={[
          { text: v.byKind === 'operator' && v.verdict === 'PASS' ? 'Approved' : TEXT[v.verdict], strong: true },
          { text: v.id, code: true },
          v.byKind === 'operator' ? v.by : `review ${v.by}`,
          v.sessionId && `session ${v.sessionId.slice(0, 8)}`,
          `on ${v.attemptId}`,
          hhmm(v.at),
        ]}
      />
      <p>{v.summary}</p>
      {v.findings.length > 0 && (
        <ul className="vf-findings">
          {v.findings.map((f, i) => (
            <li key={i} className={`sev-${f.severity}`}>
              {f.path && <code>{f.line ? `${f.path}:${f.line}` : f.path}</code>} {f.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
