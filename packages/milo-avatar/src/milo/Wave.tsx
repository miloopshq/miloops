import { WAVE_HEIGHT, waveRects, waveWidth } from './rects';

export function Wave({
  heights,
  bars,
  unit,
  colors,
}: {
  heights: number[] | null;
  bars: number;
  unit: number;
  colors: { bar: string; lead: string };
}) {
  const width = waveWidth(bars);
  return (
    <svg
      className={`milo-wave${heights ? ' on' : ''}`}
      width={width * unit}
      height={WAVE_HEIGHT * unit}
      viewBox={`0 0 ${width} ${WAVE_HEIGHT}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {waveRects(heights, bars, colors).map((r, i) => (
        <rect key={i} {...r} />
      ))}
    </svg>
  );
}
