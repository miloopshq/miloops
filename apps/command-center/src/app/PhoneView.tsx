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
  const { tab } = props;
  return (
    <main className="phone-view">
      {props.decisions ? (
        props.decisions
      ) : tab === 'home' ? (
        props.inbox
      ) : tab === 'map' ? (
        props.map
      ) : tab === 'ticket' ? (
        <Panel className="zone">{props.ticket}</Panel>
      ) : tab === 'activity' ? (
        <Panel className="zone">{props.activity}</Panel>
      ) : (
        props.plan
      )}
    </main>
  );
}
