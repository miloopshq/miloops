/** A small pixel "i" in a square that explains what it sits next to, on hover or keyboard focus (via the app tooltip). */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-tip" data-tip={text} data-tip-scout tabIndex={0} role="img" aria-label={text}>
      <svg viewBox="0 0 7 7" width="14" height="14" shapeRendering="crispEdges" aria-hidden="true">
        <rect x="3" y="1" width="1" height="1" />
        <rect x="2" y="3" width="2" height="1" />
        <rect x="3" y="4" width="1" height="1" />
        <rect x="2" y="5" width="3" height="1" />
      </svg>
    </span>
  );
}
