import type { ReactNode } from 'react';
import { Meta } from '../../components/ui';

export function BriefingRow(props: {
  k: string;
  text: ReactNode;
  meta?: ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <li>
      <button className="bf-row" onClick={props.onClick} title={props.title}>
        <span className="key">{props.k}</span>
        <span className="t">{props.text}</span>
        {props.meta && <Meta as="span" parts={[props.meta]} />}
      </button>
    </li>
  );
}
