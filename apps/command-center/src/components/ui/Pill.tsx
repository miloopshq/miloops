import type { ReactNode } from 'react';
import { cx } from '../../lib';

/** Small status/source tag. `state` colors it from the nearest `st-*` class. */
export function Pill({
  tone,
  className,
  children,
  title,
}: {
  tone?: 'state' | 'fill' | 'amber';
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={cx('pill', tone, className)} title={title}>
      {children}
    </span>
  );
}
