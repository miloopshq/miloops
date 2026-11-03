import type { TrackerTestResult } from '@miloops-hq/core';

export function TestLine({ r }: { r?: TrackerTestResult }) {
  if (!r) return null;
  if (!r.ok) return <div className="test-line alert">✕ {r.error}</div>;
  const rate = r.rate?.limit ? `${r.rate.remaining?.toLocaleString()}/${r.rate.limit.toLocaleString()} req` : '';
  let access = '';
  if (r.canWrite === false) access = 'read-only';
  else if (r.canWrite) access = 'read/write';
  return <div className="test-line ok">✓ {[r.account, r.target, access, rate].filter(Boolean).join(' · ')}</div>;
}
