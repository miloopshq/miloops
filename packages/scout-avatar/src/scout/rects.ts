export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
}

export const waveWidth = (bars: number) => bars * 2;
export const WAVE_HEIGHT = 3.5;

/** Waveform bars in a `waveWidth × WAVE_HEIGHT` box; the two newest bars take the lead color while sounding. */
export function waveRects(heights: number[] | null, bars: number, colors: { bar: string; lead: string }): Rect[] {
  return (heights ?? []).map((amp, i) => {
    const hh = (1 + 2 * amp) * 0.5;
    return {
      x: i * 2,
      y: (WAVE_HEIGHT - hh) / 2,
      width: 1,
      height: hh,
      fill: i >= bars - 2 && amp > 0 ? colors.lead : colors.bar,
    };
  });
}
