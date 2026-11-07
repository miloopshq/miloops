import { STYLES, Sprite, composeFrame } from '../../src/scout';

/** Brand exports. Captured at deviceScaleFactor 1 so every sprite pixel is an integer block of screen pixels. */
export function BrandSquare({ n }: { n: number }) {
  const rows = composeFrame(STYLES.crt.art, { eyes: 'open', mouth: 'rest' });
  const scale = Math.floor(n / 32);
  return (
    <div
      className="brand-square"
      data-capture="square"
      style={{ width: n, height: n, ['--px' as string]: `${scale}px` }}
    >
      <Sprite rows={rows} palette={STYLES.crt.palette} scale={scale} />
    </div>
  );
}
