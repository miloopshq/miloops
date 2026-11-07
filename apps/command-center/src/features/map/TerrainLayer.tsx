import { memo, useMemo } from 'react';
import { terrainFor } from './terrain';
import { SPRITE_NAMES, TerrainSymbol } from './TerrainSymbol';

/** The landscape under the tickets: grass, water, trees and rocks. Decoration only, so nothing in it takes clicks. */
export const TerrainLayer = memo(function TerrainLayer(props: {
  seed: string;
  width: number;
  height: number;
  nodes: { x: number; y: number }[];
}) {
  const { seed, width, height, nodes } = props;
  const terrain = useMemo(() => terrainFor({ seed, width, height, nodes }), [seed, width, height, nodes]);
  return (
    <g className="terrain" aria-hidden="true" shapeRendering="crispEdges">
      <defs>
        {SPRITE_NAMES.map((name) => (
          <TerrainSymbol key={name} name={name} />
        ))}
      </defs>
      {terrain.grass.map((r, i) => (
        <rect key={i} {...{ x: r.x, y: r.y, width: r.w, height: r.h }} fill="var(--map-grass)" />
      ))}
      {terrain.water.map((r, i) => (
        <rect key={i} {...{ x: r.x, y: r.y, width: r.w, height: r.h }} fill="var(--map-water)" />
      ))}
      <rect x={-4000} y={-4000} width={width + 8000} height={height + 8000} fill="url(#map-grid)" />
      {terrain.items.map((item, i) => (
        <use key={i} href={`#terrain-${item.sprite}`} x={item.x} y={item.y} />
      ))}
    </g>
  );
});
