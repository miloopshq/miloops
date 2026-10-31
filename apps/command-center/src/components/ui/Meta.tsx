import type { ReactNode, ElementType } from 'react';
import { cx } from '../../lib';

/** Mono caps meta line; falsy parts are dropped, the rest joined with " · ". */
export function Meta({
  parts,
  className,
  as: Tag = 'div',
}: {
  parts: ReactNode[];
  className?: string;
  as?: ElementType;
}) {
  const shown = parts.filter((p) => p !== undefined && p !== null && p !== false && p !== '');
  return (
    <Tag className={cx('meta', className)}>
      {shown.map((p, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {p}
        </span>
      ))}
    </Tag>
  );
}
