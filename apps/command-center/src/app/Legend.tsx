export function Legend({ planOnly }: { planOnly: boolean }) {
  const items: [string, string][] = [
    ['frontier', 'Frontier'],
    ['claimed', 'Claimed'],
    ['blocked', 'Blocked'],
    ['decided', 'Decided'],
    ...(planOnly ? ([['parked', 'Parked']] as [string, string][]) : []),
    ['out-of-scope', 'Out of scope'],
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
