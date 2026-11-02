import type { ReactNode } from 'react';
import { Panel } from './Panel';
import { SectionHeader } from './SectionHeader';

/** A fixed zone: title row + scrollable body. Zones never resize with content. `bare` renders only the body (for tabbed hosts). */
export function Zone(props: {
  title: string;
  count?: ReactNode;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
  area?: string;
  bare?: boolean;
}) {
  if (props.bare) return <div className={`zone-b ${props.className ?? ''}`}>{props.children}</div>;
  return (
    <Panel className={`zone ${props.className ?? ''}`} style={props.area ? { gridArea: props.area } : undefined}>
      <SectionHeader className="zone-title" title={props.title} count={props.count} right={props.right ?? null} />
      <div className="zone-b">{props.children}</div>
    </Panel>
  );
}
