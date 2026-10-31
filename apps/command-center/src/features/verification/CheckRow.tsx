import type { CheckResult } from '@miloops-hq/core';
import { useState } from 'react';
import { dur } from '../../lib';
import { checkOk, verificationApi } from '../../lib/verification';

/** One check of an attempt: name, exit, duration; the redacted tail on demand, then the full log from `.evidence/`. */
export function CheckRow({ check: c }: { check: CheckResult }) {
  const ok = checkOk(c);
  const [log, setLog] = useState<string>();
  const [err, setErr] = useState<string>();
  const exit = c.error ? 'did not start' : c.timedOut ? 'timed out' : `exit ${c.exitCode ?? c.signal ?? '?'}`;
  return (
    <details className={`vf-row ${ok ? 'ok' : 'bad'}`} open={!ok}>
      <summary>
        <span className="vf-mark">{ok ? '✓' : '✕'}</span>
        <span className="mono-label">{c.name}</span>
        <span className="dim">{exit}</span>
        <span className="dim vf-dur">{dur(c.durationMs)}</span>
      </summary>
      <code className="vf-argv">{c.argv.join(' ')}</code>
      {c.error && <p className="vf-note">{c.error}</p>}
      <pre className="vf-tail">{log ?? (c.tail || 'No output.')}</pre>
      <div className="vf-log-line">
        {log === undefined && (
          <button
            className="link"
            onClick={() =>
              verificationApi.log(c.log).then(
                (l) => setLog(l.clipped ? `[earlier output not shown]\n${l.text}` : l.text),
                (e: Error) => setErr(e.message),
              )
            }
          >
            Full log ›
          </button>
        )}
        {c.truncated && <span className="dim">log capped at 1 MB</span>}
        {err && <span className="vf-err">{err}</span>}
      </div>
    </details>
  );
}
