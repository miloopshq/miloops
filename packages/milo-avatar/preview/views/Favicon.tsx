import { STYLES, Sprite, composeFrame } from '../../src/milo';

export function Favicon({ px }: { px: number }) {
  const rows = composeFrame(STYLES.crt.mini, { eyes: 'open', mouth: 'rest' });
  return (
    <div className="favicon" data-capture="favicon" style={{ width: px, height: px }}>
      <Sprite rows={rows} palette={STYLES.crt.palette} scale={px / 16} />
    </div>
  );
}
