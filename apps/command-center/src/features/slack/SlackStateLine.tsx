import type { SlackNotifyEvent, SlackStatus } from '@miloops-hq/connector-slack';
import { BRAND } from '@miloops-hq/core';

export const EVENT_LABEL: Record<SlackNotifyEvent, string> = {
  awaiting: 'Awaiting you',
  blocked: 'Blocked',
  'mission.done': 'Mission done',
  resolved: 'Resolved',
};

export function SlackStateLine({ s }: { s: SlackStatus }) {
  const [cls, text] = stateLine(s);
  return (
    <div className={`sync-line ${cls}`} title={s.error}>
      <span className="dot" />
      <span>{text}</span>
    </div>
  );
}

function stateLine(s: SlackStatus): [string, string] {
  switch (s.state) {
    case 'online':
      return ['ok', 'Online'];
    case 'connecting':
      return ['', 'Connecting'];
    case 'offline':
      return ['warn', 'Offline · reconnecting'];
    case 'auth-error':
      return ['alert', 'Disconnected · Slack rejected the tokens'];
    case 'elsewhere': {
      const holder = s.heldBy ? ` (${s.heldBy})` : '';
      return ['warn', `Connected from another ${BRAND.slug}${holder}`];
    }
    case 'unsupported':
      return ['alert', s.error ?? 'Not supported here'];
    default:
      return ['', s.step === 'done' ? 'Off' : 'Not connected'];
  }
}
