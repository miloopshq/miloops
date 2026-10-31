import type { ReactNode } from 'react';
import { Label } from '../../components/ui';

export function SettingsSection(props: { title: string; children: ReactNode }) {
  return (
    <section className="set-sec">
      <Label as="h4">{props.title}</Label>
      {props.children}
    </section>
  );
}
