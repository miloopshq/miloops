/** Patterns shared by the graph: the map grid, the sign grain and the hatches. */
export function GraphDefs() {
  return (
    <defs>
      <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0H0V40" fill="none" stroke="var(--map-grid)" strokeWidth="1" />
      </pattern>
      <pattern id="sign-grain" width="200" height="9" patternUnits="userSpaceOnUse">
        <rect y="8" width="200" height="1" fill="var(--sign-grain)" />
      </pattern>
      <pattern id="hatch-oos" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="10" stroke="var(--line)" strokeWidth="2" />
      </pattern>
      <pattern id="hatch-dim" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--sign-grain)" strokeWidth="1.5" />
      </pattern>
    </defs>
  );
}
