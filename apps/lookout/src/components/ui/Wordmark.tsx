import { BRAND } from '@teamtrail/core';
import type { ElementType } from 'react';

/** The product name in its display font and one colour; `className` sets the size. */
export function Wordmark({ as: Tag = 'span', className }: { as?: ElementType; className?: string }) {
  return <Tag className={className}>{BRAND.name}</Tag>;
}
