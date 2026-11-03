import type { ReactNode } from 'react';
import { Panel, Tabs } from '../components/ui';
import type { SideTab } from './tabs';

/** Laptop right zone: ticket, activity and plan share one tabbed panel. */
export function LaptopSide(props: {
  tab: SideTab;
  onTab: (tab: SideTab) => void;
  unspecified?: number;
  ticket: ReactNode;
  activity: ReactNode;
  plan: ReactNode;
}) {
  return (
    <Panel className="zone side" style={{ gridArea: 'inspector' }}>
      <Tabs
        className="zone-tabs"
        value={props.tab}
        onChange={props.onTab}
        items={[
          { id: 'ticket', label: 'Ticket' },
          { id: 'activity', label: 'Activity' },
          { id: 'plan', label: 'Plan', n: props.unspecified },
        ]}
      />
      {{ ticket: props.ticket, activity: props.activity, plan: props.plan }[props.tab]}
    </Panel>
  );
}
