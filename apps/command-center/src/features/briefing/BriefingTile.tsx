import type { ReactNode } from 'react';
import { Card, Meta } from '../../components/ui';

export function BriefingTile(props: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  urgent?: boolean;
  className?: string;
}) {
  return (
    <Card tone={props.urgent ? 'urgent' : undefined} className={`bf-tile ${props.className ?? ''}`}>
      <span className="mono-label">{props.label}</span>
      <b>{props.value}</b>
      {props.sub && <Meta parts={[props.sub]} />}
    </Card>
  );
}
