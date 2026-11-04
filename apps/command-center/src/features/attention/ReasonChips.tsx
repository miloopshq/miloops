/** Why an item ranks where it does, as small chips: "blocks 4 tickets", "claude-07 idle for 12 min". */
export function ReasonChips(props: { reasons: string[]; max?: number }) {
  const shown = props.reasons.slice(0, props.max ?? 3);
  if (!shown.length) return null;
  return (
    <span className="reason-chips" title={props.reasons.join('\n')}>
      {shown.map((r) => (
        <span key={r} className="reason-chip">
          {r}
        </span>
      ))}
    </span>
  );
}
