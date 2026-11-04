/** Paths and refs inside a reason ("both touch src/sync/status.ts") are set as code; the rest stays plain. */
const CODE = /(\S*\/\S*|#\d+)/g;

/** Why an item ranks where it does, as one quiet line: "blocks 4 tickets · claude-07 is waiting for you". */
export function ReasonLine({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return null;
  return (
    <span className="reason-line">
      {reasons.map((r, i) => (
        <span key={r}>
          {i > 0 && <span className="sep"> · </span>}
          {r.split(CODE).map((p, j) =>
            j % 2 === 1 ? (
              <span key={j} className="t-code">
                {p}
              </span>
            ) : (
              p
            ),
          )}
        </span>
      ))}
    </span>
  );
}
