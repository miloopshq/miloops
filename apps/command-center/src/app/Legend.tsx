export function Legend({ planOnly, verifies }: { planOnly: boolean; verifies: boolean }) {
  const items: [string, string][] = [
    ['frontier', 'Ready'],
    ['claimed', 'Working'],
    ...(verifies
      ? ([
          ['verifying', 'Verifying'],
          ['rework', 'Rework'],
          ['held', 'Blocked'],
        ] as [string, string][])
      : []),
    ['stalled', 'Stalled'],
    ['blocked', 'Backlog'],
    ['decided', 'Done'],
    ...(planOnly ? ([['parked', 'Parked']] as [string, string][]) : []),
    ['out-of-scope', 'Cancelled'],
    ['waiting', 'Waiting on you'],
  ];
  return (
    <div className="legend">
      {items.map(([k, v]) => (
        <span key={k} className={`lg st-${k}`}>
          <i />
          {v}
        </span>
      ))}
      <span className="lg hitl">● needs human</span>
    </div>
  );
}
