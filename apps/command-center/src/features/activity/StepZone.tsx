import { Panel, SectionHeader } from '../../components/ui';
import { Sessions } from './Sessions';
import { SessionsHead } from './SessionsHead';
import { StepTracker } from './StepTracker';
import type { ZoneProps } from './types';

/** Wide: current step + sessions in one fixed zone. */
export function StepZone(props: ZoneProps) {
  const running = props.activity.sessions.filter((s) => s.status === 'running').length;
  return (
    <Panel className="zone step-zone" style={{ gridArea: 'step' }}>
      <SectionHeader title="Current step" />
      <div className="zone-b">
        <StepTracker activity={props.activity} snap={props.snap} />
        <SessionsHead activity={props.activity} snap={props.snap} running={running} />
        <Sessions
          snap={props.snap}
          activity={props.activity}
          onSelect={(s) => s?.kind === 'ticket' && props.onTicket(s.id)}
          onOpenChat={props.onOpenChat}
        />
      </div>
    </Panel>
  );
}
