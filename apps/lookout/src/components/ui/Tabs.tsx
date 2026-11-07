import type { ReactNode } from 'react';

/** Simple segmented tabs used by tabbed zones. */
export function Tabs<T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string; n?: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={`tabs ${props.className ?? ''}`} role="tablist">
      {props.items.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={props.value === t.id}
          className={`tab ${props.value === t.id ? 'on' : ''}`}
          onClick={() => props.onChange(t.id)}
        >
          {t.label}
          {t.n !== undefined && <span className="n">{t.n}</span>}
        </button>
      ))}
    </div>
  );
}
