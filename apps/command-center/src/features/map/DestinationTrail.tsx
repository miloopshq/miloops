/** The last stretches of trail, each a cleared path with dashes on it, leading to the X. */
export function DestinationTrail({ trails }: { trails: string[] }) {
  return trails.map((d) => (
    <g key={d}>
      <path className="edge-path" d={d} />
      <path className="edge edge-open" d={d} />
    </g>
  ));
}
