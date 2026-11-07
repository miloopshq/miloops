import type { ReactNode } from 'react';
import { ScoutMark } from './ScoutMark';

/** A zone with nothing to show yet: a small dim mark (or `art`, beside the words), what will appear here, and how to start. */
export function EmptyState({ title, hint, art }: { title: string; hint?: string; art?: ReactNode }) {
  return (
    <div className={art ? 'empty-state has-art' : 'empty-state'}>
      {art ?? <ScoutMark size={18} className="es-mark" />}
      <div className="es-words">
        <span className="es-title">{title}</span>
        {hint && <span className="es-hint">{hint}</span>}
      </div>
    </div>
  );
}
