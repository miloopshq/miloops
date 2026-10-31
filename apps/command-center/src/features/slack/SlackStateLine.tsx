import type { SlackNotifyEvent, SlackStatus } from '@miloops-hq/connector-slack';
import { BRAND } from '@miloops-hq/core';

export const EVENT_LABEL: Record<SlackNotifyEvent, string> = {
  awaiting: 'Awaiting you',
  blocked: 'Blocked',
  'mission.done': 'Mission done',
  resolved: 'Resolved',
};

export function SlackStateLine({ s }: { s: SlackStatus }) {
  const [cls, text] =
    s.state === 'online'
      ? ['ok', 'Online']
      : s.state === 'connecting'
        ? ['', 'Connecting']
        : s.state === 'offline'
          ? ['warn', 'Offline · reconnecting']
          : s.state === 'auth-error'
            ? ['alert', 'Disconnected · Slack rejected the tokens']
            : s.state === 'elsewhere'
              ? ['warn', `Connected from another ${BRAND.slug}${s.heldBy ? ` (${s.heldBy})` : ''}`]
              : s.state === 'unsupported'
                ? ['alert', s.error ?? 'Not supported here']
                : ['', s.step === 'done' ? 'Off' : 'Not connected'];
  return (
    <div className={`sync-line ${cls}`} title={s.error}>
      <span className="dot" />
      <span>{text}</span>
    </div>
  );
}
