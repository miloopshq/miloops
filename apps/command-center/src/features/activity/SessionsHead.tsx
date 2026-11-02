import {
  type ActivityState,
  type MapSnapshot,
  missionUsage,
  missionUsageSources,
  USAGE_SOURCE,
} from '@miloops-hq/core';
import { SectionHeader } from '../../components/ui';
import { isRunning, tokens, usd } from '../../lib';

/** Header of the agent list. Mission spend shows here only where the app header doesn't carry it (phone, laptop tab). */
export function SessionsHead({
  activity,
  snap,
  running,
  usage = true,
}: {
  activity: ActivityState;
  snap?: MapSnapshot;
  running: number;
  usage?: boolean;
}) {
  const u = missionUsage(activity, snap?.map.id);
  const sources = missionUsageSources(activity, snap?.map.id);
  // Running sessions plus claims without a session (teammates), the same rows the list below shows.
  const live = new Set(activity.sessions.filter(isRunning).map((s) => s.ticketId));
  const claims = snap?.tickets.filter((t) => t.state === 'open' && t.assignee && !live.has(t.id)).length ?? 0;
  return (
    <SectionHeader
      sub
      className="sessions-head"
      title={
        <>
          Agents on tickets <span className="n">{running + claims}</span>
        </>
      }
      right={
        usage ? (
          <span
            className="usage"
            title={['Model usage for this mission, all sessions', ...sources.map((x) => USAGE_SOURCE[x].text)].join(
              '\n',
            )}
          >
            <span className="mono-label">Mission</span> {tokens(u.inputTokens + u.outputTokens)} tok · {usd(u.costUsd)}
          </span>
        ) : undefined
      }
    />
  );
}
