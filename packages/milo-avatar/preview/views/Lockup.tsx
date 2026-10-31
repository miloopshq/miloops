import { STYLES, Sprite, composeFrame } from '../../src/milo';
import { Wordmark } from './Wordmark';

/** The mini sprite minus its empty top and bottom rows, so it centres on the wordmark's cap height. */
const ROWS = composeFrame(STYLES.crt.mini, { eyes: 'open', mouth: 'rest' }).filter((row) => /[^.]/.test(row));

/** Logo lockup: mini MILO beside the wordmark. The sprite is twice the cap height, at an integer pixel scale. */
export function Lockup({ w, h, wordmark }: { w: number; h: number; wordmark: string }) {
  const scale = Math.round(h / 30);
  const font = scale * 10;
  return (
    <div
      className="lockup"
      data-capture="lockup"
      style={{ width: w, height: h, gap: font / 2, ['--u' as string]: `${font / 110}px` }}
    >
      <Sprite rows={ROWS} palette={STYLES.crt.palette} scale={scale} />
      <Wordmark text={wordmark} />
    </div>
  );
}
