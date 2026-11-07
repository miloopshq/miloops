import type { ReactNode } from 'react';

export function BriefingList(props: { title: string; urgent?: boolean; children: ReactNode[] }) {
  if (!props.children.length) return null;
  return (
    <div className={`bf-list ${props.urgent ? 'urgent' : ''}`}>
      <span className="mono-label">{props.title}</span>
      <ul>{props.children}</ul>
    </div>
  );
}
