import type { NodeState, Ticket } from '@teamtrail/core';
import { useState } from 'react';
import { Label, MetaLine } from '../../components/ui';
import { hhmm, TRAIL_LEAD } from '../../lib';
import { type ActionRequest, LEVEL_TEXT, verificationApi } from '../../lib/verification';
import { AttemptRow } from './AttemptRow';
import { LevelControl } from './LevelControl';
import { ReviewVerdict } from './ReviewVerdict';
import { useVerification } from './useVerification';
import { VerificationActions } from './VerificationActions';

const SOURCE = { ticket: 'set on this ticket', trail: 'from the trail', none: 'not set' } as const;
const LIVE = new Set<NodeState>(['verifying', 'rework', 'held']);

/** Ticket inspector section: the level that applies, trail lead actions, verdicts and attempts, newest first. */
export function VerificationPanel(props: {
  mapId: string;
  trail?: Ticket['verification'];
  ticket: Ticket;
  state: NodeState;
}) {
  const { mapId, ticket: t, state } = props;
  const { data, reload } = useVerification(mapId, t.id, t.updatedAt);
  const [error, setError] = useState<string>();
  if (!data || (data.level.level === 'off' && !data.attempts.length && !LIVE.has(state))) return null;
  const act = (req: Omit<ActionRequest, 'mapId' | 'ticketId'>) => {
    setError(undefined);
    return verificationApi
      .act({ ...req, mapId, ticketId: t.id, by: TRAIL_LEAD })
      .then(reload, (e: Error) => setError(e.message));
  };
  const running = data.running;
  return (
    <section className="vf-panel">
      <div className="vf-head">
        <Label as="h4">Verification</Label>
        <MetaLine parts={[LEVEL_TEXT[data.level.level], SOURCE[data.level.source]]} />
        {t.state === 'open' && (
          <LevelControl
            value={t.verification}
            inherit={`Trail (${LEVEL_TEXT[props.trail ?? 'off']})`}
            onChange={(level) => void act({ action: 'level', level })}
          />
        )}
      </div>
      {running && (
        <div className="sync-line vf-running">
          <span className="dot" />
          <span>
            Checking {running.id} for {running.agent} · since {hhmm(running.startedAt)}
          </span>
        </div>
      )}
      <VerificationActions state={state} submitted={data.attempts.length > 0} running={!!running} act={act} />
      {error && <p className="vf-err">{error}</p>}
      {data.verdicts.map((v) => (
        <ReviewVerdict key={v.id} verdict={v} />
      ))}
      {data.attempts.map((a, i) => (
        <AttemptRow key={a.id} attempt={a} latest={i === 0} />
      ))}
      {!data.attempts.length && !running && (
        <MetaLine parts={[`Checks: ${data.level.checks.join(', ') || 'none'}`, 'run when the ticket is submitted']} />
      )}
    </section>
  );
}
