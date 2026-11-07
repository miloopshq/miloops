import { Logo } from '../../src/scout';
import { Wordmark } from './Wordmark';

/** Logo lockup: the logo beside the one-colour wordmark. */
export function Lockup({ w, h, wordmark, light }: { w: number; h: number; wordmark: string; light?: boolean }) {
  const font = Math.round(h / 30) * 10;
  return (
    <div
      className={light ? 'lockup light' : 'lockup'}
      data-capture="lockup"
      style={{ width: w, height: h, gap: font / 3, ['--u' as string]: `${font / 110}px` }}
    >
      <Logo size={Math.round(h * 0.74)} />
      <Wordmark text={wordmark} />
    </div>
  );
}
