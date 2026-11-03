import { MiloMark } from './MiloMark';

/** A zone with nothing to show yet: a small dim MILO mark, what will appear here, and how it gets there. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-state">
      <MiloMark size={18} className="es-mark" />
      <span className="es-title">{title}</span>
      {hint && <span className="es-hint">{hint}</span>}
    </div>
  );
}
