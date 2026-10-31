import type { TrackerTestResult } from '@miloops-hq/core';

export function TestLine({ r }: { r?: TrackerTestResult }) {
  if (!r) return null;
  if (!r.ok) return <div className="test-line alert">✕ {r.error}</div>;
  const rate = r.rate?.limit ? `${r.rate.remaining?.toLocaleString()}/${r.rate.limit.toLocaleString()} req` : '';
  return (
    <div className="test-line ok">
      ✓{' '}
      {[r.account, r.target, r.canWrite === false ? 'read-only' : r.canWrite ? 'read/write' : '', rate]
        .filter(Boolean)
        .join(' · ')}
    </div>
  );
}
