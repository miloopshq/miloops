/** Hatch patterns and the edge arrowhead shared by every node and edge of the graph. */
export function GraphDefs() {
  return (
    <defs>
      <pattern id="hatch-oos" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="rgba(255,77,66,0.05)" />
        <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,77,66,0.45)" strokeWidth="2.2" />
      </pattern>
      <pattern id="hatch-dim" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(120,160,170,0.12)" strokeWidth="1.5" />
      </pattern>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0 1L9 5L0 9" fill="none" stroke="context-stroke" strokeWidth="1.4" />
      </marker>
    </defs>
  );
}
