import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../../lib';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger' | 'urgent';

export function Button({
  variant = 'default',
  size = 'md',
  on,
  className,
  type,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md'; on?: boolean }) {
  return (
    <button
      type={type ?? 'button'}
      className={cx('btn', variant !== 'default' && variant, size === 'sm' && 'sm', on && 'on', className)}
      {...rest}
    />
  );
}
