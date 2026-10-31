import type { ElementType, ReactNode, FormEvent } from 'react';
import { cx } from '../../lib';

export function Card({
  as: Tag = 'div',
  tone,
  on,
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  tone?: 'urgent' | 'inset';
  on?: boolean;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  onSubmit?: (e: FormEvent) => void;
  title?: string;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <Tag className={cx('card', tone, on && 'on', className)} {...rest}>
      {children}
    </Tag>
  );
}
