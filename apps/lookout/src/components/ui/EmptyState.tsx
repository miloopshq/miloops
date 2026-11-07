import type { ReactNode } from 'react';
import { ScoutBadge } from './ScoutBadge';

/** A zone with nothing to show yet: Scout's small badge (or `art`, beside the words), what will appear here, and how to start. */
export function EmptyState({ title, hint, art }: { title: string; hint?: string; art?: ReactNode }) {
  return (
    <div className={art ? 'empty-state has-art' : 'empty-state'}>
      {art ?? <ScoutBadge className="es-mark" />}
      <div className="es-words">
        <span className="es-title">{title}</span>
        {hint && <span className="es-hint">{hint}</span>}
      </div>
    </div>
  );
}
