import type { VerificationAttempt } from '@miloops-hq/core';
import { Meta } from '../../components/ui';

const short = (sha?: string | null) => sha?.slice(0, 8) ?? 'none';
const count = (n: number | null) => (n === null ? '·' : String(n));

/** What git showed of the completion: base → head on a branch, the files changed since the claim, and the flags. */
export function GitEvidence({ attempt }: { attempt: VerificationAttempt }) {
  const g = attempt.git;
  if (!g) return null;
  const { files, add, del } = g.stats;
  return (
    <div className="vf-git">
      <Meta
        parts={[
          g.tree ? `${g.base ? `${short(g.base.head)} → ` : ''}${short(g.tree.head)}` : 'not a git repo',
          g.tree && (g.tree.branch ?? 'detached HEAD'),
          g.tree && `${files} file${files === 1 ? '' : 's'} +${add} −${del}`,
        ]}
      />
      {g.flags
        .filter((f) => f.kind !== 'no-git')
        .map((f) => (
          <p key={f.kind} className={`vf-flag lv-${f.level}`} title={f.files?.join('\n')}>
            <span className="mono-label">{f.kind}</span> {f.message}
          </p>
        ))}
      {g.changed.length > 0 && (
        <details className="vf-files">
          <summary className="mono-label">Changed files</summary>
          <ul>
            {g.changed.map((c) => (
              <li key={c.path}>
                <code>{c.path}</code>
                <span className="dim">
                  {c.untracked ? 'new' : `+${count(c.add)} −${count(c.del)}`}
                  {c.dirtyAtClaim ? ' · dirty at claim' : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
