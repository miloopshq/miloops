/** Sparkline (line) over bars, both normalised to their own max. */
export function Spark(props: { line: number[]; bars?: number[]; width?: number; height?: number }) {
  const W = props.width ?? 160;
  const H = props.height ?? 34;
  const n = props.line.length;
  const lmax = Math.max(1, ...props.line);
  const bmax = Math.max(1, ...(props.bars ?? [0]));
  const step = W / Math.max(1, n);
  const pts = props.line.map((v, i) => `${(i + 0.5) * step},${H - 2 - (v / lmax) * (H - 6)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      {props.bars?.map(
        (v, i) =>
          v > 0 && (
            <rect
              key={i}
              x={i * step + 1}
              y={H - (v / bmax) * (H * 0.55)}
              width={Math.max(1, step - 2)}
              height={(v / bmax) * (H * 0.55)}
              className="sp-bar"
            />
          ),
      )}
      <polyline points={pts} className="sp-line" fill="none" />
    </svg>
  );
}
