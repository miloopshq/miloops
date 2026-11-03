import type { ReactNode } from 'react';
import { Panel } from '../components/ui';
import type { PhoneTab } from './tabs';

/** The single phone view: an open decisions view covers it, otherwise the selected tab's layer. */
export function PhoneView(props: {
  tab: PhoneTab;
  decisions: ReactNode;
  inbox: ReactNode;
  map: ReactNode;
  ticket: ReactNode;
  activity: ReactNode;
  plan: ReactNode;
}) {
  const layers: Record<PhoneTab, ReactNode> = {
    home: props.inbox,
    map: props.map,
    ticket: <Panel className="zone">{props.ticket}</Panel>,
    activity: <Panel className="zone">{props.activity}</Panel>,
    plan: props.plan,
  };
  return <main className="phone-view">{props.decisions || layers[props.tab]}</main>;
}
