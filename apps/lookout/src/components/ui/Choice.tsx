import type { ReactNode } from 'react';
import { Card } from './Card';

/** Selectable option card (settings, onboarding, trail mode). */
export function Choice({
  on,
  title,
  sub,
  disabled,
  onClick,
}: {
  on: boolean;
  title: ReactNode;
  sub?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card as="button" type="button" className="choice" on={on} disabled={disabled} onClick={onClick}>
      <b className="choice-title t-row-title">{title}</b>
      {sub && <span className="c-sub">{sub}</span>}
    </Card>
  );
}
