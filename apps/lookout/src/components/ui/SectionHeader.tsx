import type { ReactNode } from 'react';
import { cx } from '../../lib';
import { InfoTip } from './InfoTip';
import { Label } from './Label';
import { ZoneIcon, type ZoneIconName } from './ZoneIcon';

/** Zone/part header: a chip label, an optional count, and a right-aligned slot. `sub` is the inline variant inside a body. */
export function SectionHeader({
  title,
  count,
  right,
  hot,
  sub,
  children,
  className,
  info,
  icon,
}: {
  title?: ReactNode;
  count?: ReactNode;
  right?: ReactNode;
  hot?: boolean;
  sub?: boolean;
  children?: ReactNode;
  className?: string;
  /** Hover/focus explanation of the zone, shown from an info icon next to the title. */
  info?: string;
  /** A small icon before the title. */
  icon?: ZoneIconName;
}) {
  return (
    <header className={cx('sec-h', sub && 'sub', className)}>
      {children}
      {icon && <ZoneIcon name={icon} />}
      {title !== undefined && (
        <Label as={sub ? 'h3' : 'h2'} hot={hot}>
          {title}
        </Label>
      )}
      {info && <InfoTip text={info} />}
      {count}
      {right !== undefined && <span className="sec-h-right">{right}</span>}
    </header>
  );
}
