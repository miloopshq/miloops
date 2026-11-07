/** The hand-drawn X that marks the spot: where the trail ends. */
export function DestinationMark({ x, y }: { x: number; y: number }) {
  return (
    <g className="destination" transform={`translate(${x} ${y})`} aria-label="Destination">
      <path className="x-stroke" d="M-32 -35 C-20 -22 4 8 33 36" />
      <path className="x-stroke" d="M35 -33 C14 -18 -12 10 -35 37" />
      <path className="x-sketch" d="M-29 -29 C-14 -13 8 8 28 29 M30 -28 C12 -13 -8 6 -29 31" />
      <text y={58} textAnchor="middle">
        Destination
      </text>
    </g>
  );
}
