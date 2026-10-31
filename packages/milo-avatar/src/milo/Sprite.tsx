import { spriteRects } from './rects';
import type { Palette } from './types';

/** Pixel rows -> one crisp SVG, merging horizontal runs of the same color into single rects. */
export function Sprite({
  rows,
  palette,
  scale,
  className,
}: {
  rows: string[];
  palette: Palette;
  scale: number;
  className?: string;
}) {
  const w = rows[0]?.length ?? 0;
  const h = rows.length;
  return (
    <svg
      className={className}
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {spriteRects(rows, palette).map((r) => (
        <rect key={`${r.y}-${r.x}`} {...r} />
      ))}
    </svg>
  );
}
