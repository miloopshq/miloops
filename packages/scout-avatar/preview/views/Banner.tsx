import { ScoutAvatar, STYLES, Sprite, composeFrame, type ScoutState } from '../../src/scout';
import { TAGLINE } from '../content';
import { BannerLand } from './BannerLand';
import { Wordmark } from './Wordmark';

export interface BannerFrame {
  state: ScoutState;
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
      <BannerLand w={w} h={h} />
      {layout === 'card' ? (
        <div className="banner-feed">
          <ScoutAvatar
            framed={false}
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
        <div className="social-cat">The trail map for AI coding agents</div>
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
