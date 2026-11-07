import type { ReactNode } from 'react';
import { cx } from '../../lib';

export function Readout({
  label,
  value,
  layout = 'stack',
  urgent,
  title,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  layout?: 'stack' | 'start' | 'inline';
  urgent?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <span className={cx('readout', layout !== 'stack' && layout, urgent && 'urgent', className)} title={title}>
      <span className="mono-label">{label}</span>
      {layout === 'inline' && ' '}
      <b>{value}</b>
    </span>
  );
}
