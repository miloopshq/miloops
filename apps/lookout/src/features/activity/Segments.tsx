/** A session's steps as thin segments: done, the current one, then the rest. */
export function Segments({ total, step }: { total: number; step: number }) {
  return (
    <span className="segs" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={segmentClass(i + 1, step)} />
      ))}
    </span>
  );
}

function segmentClass(n: number, step: number) {
  if (n < step) return 'done';
  if (n === step) return 'cur';
  return '';
}
