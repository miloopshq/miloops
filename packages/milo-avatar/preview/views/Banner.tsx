import { MiloAvatar, STYLES, Sprite, composeFrame } from '../../src/milo';
import { TAGLINE } from '../content';
import { Wordmark } from './Wordmark';

/** card: social preview / Open Graph; header: X profile header (avatar overlaps bottom-left, so content sits right). */
export function Banner({
  w,
  h,
  layout,
  url,
  wordmark,
}: {
  w: number;
  h: number;
  layout: 'card' | 'header';
  url?: string;
  wordmark: string;
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
          <MiloAvatar variant="crt" size={Math.floor(11 * u)} state="idle" at={0} caption={false} />
        </div>
      ) : null}
      <div className="banner-copy">
        <Wordmark text={wordmark} />
        <div className="social-cat">Autonomous Agent Command Center</div>
        <div className="social-tag">{TAGLINE}</div>
        <div className="social-cmd">
          <span>$</span> npx miloops{url && <em>{url}</em>}
        </div>
      </div>
      {layout === 'header' ? (
        <div className="banner-sprite">
          <Sprite rows={rows} palette={STYLES.crt.palette} scale={Math.floor(h / 32) - 1} />
        </div>
      ) : null}
    </div>
  );
}
