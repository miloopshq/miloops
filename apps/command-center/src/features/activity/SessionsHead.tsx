import {
  type ActivityState,
  type MapSnapshot,
  missionUsage,
  missionUsageSources,
  claimsByAgent,
  USAGE_SOURCE,
} from '@miloops-hq/core';
import { SectionHeader } from '../../components/ui';
import { tokens, usd } from '../../lib';

/** Sessions header: mission usage (`metrics.usage`) and claims per agent (`metrics.claimsByAgent`). */
export function SessionsHead({
  activity,
  snap,
  running,
}: {
  activity: ActivityState;
  snap?: MapSnapshot;
  running: number;
}) {
  const u = missionUsage(activity, snap?.map.id);
  const sources = missionUsageSources(activity, snap?.map.id);
  const claims = snap ? claimsByAgent(snap) : [];
  return (
    <>
      <SectionHeader
        sub
        className="sessions-head"
        title={
          <>
            Sessions // claims <span className="n">{running}</span>
          </>
        }
        right={
          <span
            className="usage"
            title={['Model usage for this mission, all sessions', ...sources.map((x) => USAGE_SOURCE[x].text)].join(
              '\n',
            )}
          >
            <span className="mono-label">Mission</span> {tokens(u.inputTokens + u.outputTokens)} tok · {usd(u.costUsd)}
            {[...new Set(sources.map((x) => USAGE_SOURCE[x].tag))].map((tag) => (
              <span key={tag} className={`usage-src tag-${tag.toLowerCase()}`}>
                {tag}
              </span>
            ))}
          </span>
        }
      />
      {claims.length > 0 && (
        <ul className="claims-bar" aria-label="Claims per agent">
          {claims.map((c) => (
            <li key={c.agent}>
              <span className="callsign">{c.agent}</span>
              <span className="pips">
                {Array.from({ length: c.count }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
              <b>{c.count}</b>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
