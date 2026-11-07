import { useMemo } from 'react';
import { type BadgeFace, badgeMarkup } from './badgeArt';
import { STYLES } from './frames';
import type { ScoutStyleId } from './types';

/** Scout's merit badge at any size. Small sizes use the simple drawing. */
export function Badge({
  face = { eyes: 'open', mouth: 'rest' },
  variant = 'crt',
  size,
  simple,
  className,
}: {
  face?: BadgeFace;
  variant?: ScoutStyleId;
  size: number;
  simple?: boolean;
  className?: string;
}) {
  const { eyes, mouth, light } = face;
  const html = useMemo(
    () => badgeMarkup({ eyes, mouth, light }, { lamp: STYLES[variant].lamp, simple: simple ?? size < 28 }),
    [eyes, mouth, light, variant, simple, size],
  );
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
