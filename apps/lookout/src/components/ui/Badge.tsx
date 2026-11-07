import { cx } from '../../lib';

/** Count badge. For the arrival pop, render it with `key={n}` so it remounts when the count changes. */
export function Badge({
  n,
  urgent,
  pop,
  hideZero,
}: {
  n: number;
  urgent?: boolean;
  pop?: boolean;
  hideZero?: boolean;
}) {
  return (
    <span className={cx('badge', urgent && 'urgent', pop && urgent && 'pop', hideZero && !n && 'zero')}>
      {hideZero && !n ? '' : n}
    </span>
  );
}
