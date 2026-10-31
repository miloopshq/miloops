import type { ElementType, ReactNode } from 'react';
import { cx } from '../../lib';

/** Framed chip label (`chip`) or plain mono caps caption (`plain`). */
export function Label({
  as: Tag = 'span',
  variant = 'chip',
  hot,
  size,
  className,
  children,
  title,
}: {
  as?: ElementType;
  variant?: 'chip' | 'plain';
  hot?: boolean;
  size?: 'sm';
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <Tag
      className={cx(
        variant === 'chip' ? 'chip-label' : 'mono-label',
        hot && 'hot',
        size === 'sm' && (variant === 'chip' ? 'sm' : 'xs'),
        className,
      )}
      title={title}
    >
      {children}
    </Tag>
  );
}
