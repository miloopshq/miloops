import { BRAND } from '@miloops-hq/core';
import type { ElementType } from 'react';

/** Two-tone product wordmark; `className` sets the size and tracking. */
export function Wordmark({ as: Tag = 'span', className }: { as?: ElementType; className?: string }) {
  return (
    <Tag className={className}>
      {BRAND.wordmark.lead}
      <span className="wordmark-ops">{BRAND.wordmark.ops}</span>
    </Tag>
  );
}
