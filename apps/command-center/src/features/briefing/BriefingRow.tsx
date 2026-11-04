import type { ReactNode } from 'react';

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
        <span className="key t-code">{props.k}</span>
        <span className="t">{props.text}</span>
        {props.meta && <span className="t-meta">{props.meta}</span>}
      </button>
    </li>
  );
}
