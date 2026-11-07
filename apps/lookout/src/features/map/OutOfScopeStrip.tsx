/** The hatched strip that holds cancelled tickets, under the rest of the map. */
export function OutOfScopeStrip({ y, width, height }: { y: number; width: number; height: number }) {
  return (
    <g className="quarantine">
      <rect x={-20} y={y - 30} width={width + 40} height={height + 18} fill="url(#hatch-oos)" />
      <text x={-12} y={y - 14}>
        Out of scope
      </text>
    </g>
  );
}
