import type { ReactNode } from 'react';
import { cx } from '../../lib';
import { Label } from './Label';

/** Zone/part header: a chip label, an optional count, and a right-aligned slot. `sub` is the inline variant inside a body. */
export function SectionHeader({
  title,
  count,
  right,
  hot,
  sub,
  children,
  className,
}: {
  title?: ReactNode;
  count?: ReactNode;
  right?: ReactNode;
  hot?: boolean;
  sub?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx('sec-h', sub && 'sub', className)}>
      {children}
      {title !== undefined && (
        <Label as={sub ? 'h3' : 'h2'} hot={hot}>
          {title}
        </Label>
      )}
      {count}
      {right !== undefined && <span className="sec-h-right">{right}</span>}
    </header>
  );
}
