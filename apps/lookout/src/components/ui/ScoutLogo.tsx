import { RECOMMENDED_STYLE, STYLES, Sprite, composeFrame } from '@teamtrail/scout-avatar';

const style = STYLES[RECOMMENDED_STYLE];

/** The mini sprite without its empty top and bottom rows, so it centres on the wordmark's cap height. */
const ROWS = composeFrame(style.mini, { eyes: 'open', mouth: 'rest' }).filter((row) => /[^.]/.test(row));

/** Logo glyph for the Scout/OPS lockup. Keep `scale` an integer so every pixel stays crisp. */
export function ScoutLogo({ scale = 2, className }: { scale?: number; className?: string }) {
  return <Sprite rows={ROWS} palette={style.palette} scale={scale} className={className} />;
}
