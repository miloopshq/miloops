import { MiloAvatar, STYLES, Sprite, composeFrame, type MiloState } from '../../src/milo';
import { TAGLINE } from '../content';
import { Wordmark } from './Wordmark';

export interface BannerFrame {
  state: MiloState;
  speaking?: string;
  at: number;
}

/** card: social preview / Open Graph; header: X profile header (avatar overlaps bottom-left, so content sits right). */
export function Banner({
  w,
  h,
  layout,
  wordmark,
  frame = { state: 'idle', at: 0 },
}: {
  w: number;
  h: number;
  layout: 'card' | 'header';
  wordmark: string;
  frame?: BannerFrame;
}) {
  const u = h / 640;
  const rows = composeFrame(STYLES.crt.art, { eyes: 'open', mouth: 'rest' });
  return (
    <div
      className={`banner ${layout}`}
      data-capture="banner"
      style={{ width: w, height: h, ['--u' as string]: `${u}px` }}
    >
      {layout === 'card' ? (
        <div className="banner-feed">
          <MiloAvatar
            variant="crt"
            size={Math.floor(11 * u)}
            state={frame.state}
            speaking={frame.speaking}
            at={frame.at}
            caption={false}
          />
        </div>
      ) : null}
      <div className="banner-copy">
        <Wordmark text={wordmark} />
        <div className="social-cat">Local command center for AI coding agents</div>
        <div className="social-tag">{TAGLINE}</div>
      </div>
      {layout === 'header' ? (
        <div className="banner-sprite">
          <Sprite rows={rows} palette={STYLES.crt.palette} scale={Math.floor(h / 32) - 1} />
        </div>
      ) : null}
    </div>
  );
}
