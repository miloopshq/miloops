import type { ElementType, CSSProperties, ReactNode, MouseEvent, FormEvent } from 'react';
import { cx } from '../../lib';

/** HUD-framed surface. `frameless` drops the corner brackets (e.g. a zone embedded in a phone view). */
export function Panel({
  as: Tag = 'section',
  className,
  style,
  frameless,
  children,
  ...rest
}: {
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  frameless?: boolean;
  children: ReactNode;
  role?: string;
  'aria-label'?: string;
  onClick?: (e: MouseEvent) => void;
  onSubmit?: (e: FormEvent) => void;
}) {
  return (
    <Tag className={cx('panel', frameless && 'frameless', className)} style={style} {...rest}>
      {children}
    </Tag>
  );
}
