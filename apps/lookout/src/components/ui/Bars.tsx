/** Mini bar chart; `hot` marks a subset of each bar (e.g. external events). */
export function Bars(props: { values: number[]; hot?: number[]; height?: number; className?: string; title?: string }) {
  const h = props.height ?? 16;
  const max = Math.max(1, ...props.values);
  const w = props.values.length * 3;
  return (
    <svg
      className={`bars ${props.className ?? ''}`}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      preserveAspectRatio="none"
      aria-label={props.title}
    >
      {props.values.map((v, i) => {
        const bh = v ? Math.max(2, (v / max) * h) : 1;
        const hh = props.hot?.[i] ? Math.max(2, (props.hot[i] / max) * h) : 0;
        return (
          <g key={i}>
            <rect x={i * 3} y={h - bh} width={2} height={bh} className={v ? 'on' : 'off'} />
            {hh > 0 && <rect x={i * 3} y={h - hh} width={2} height={hh} className="hot" />}
          </g>
        );
      })}
    </svg>
  );
}
