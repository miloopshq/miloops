import type { ReactNode } from 'react';
import { cx } from '../../lib';

export function Field({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('field', className)}>
      {label}
      {children}
    </label>
  );
}
