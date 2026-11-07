import { useMemo } from 'react';
import { logoMarkup } from './logoMark';

/** The Teamtrail logo mark. Sizes at 32px and below use the simple drawing. */
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  const html = useMemo(() => logoMarkup({ simple: size <= 32 }), [size]);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label="Teamtrail"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
