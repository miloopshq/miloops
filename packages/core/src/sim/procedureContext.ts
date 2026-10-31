import type { ActivityStream } from '../activity/activityStream';
import type { SessionHandle } from '../activity/sessionHandle';
import type { TrackerAdapter } from '../adapters/adapter';
import { sleep } from '../lib/emitter';
import type { HitlTranscriptMode } from '../model/integrations';
import type { AgentBrain } from './brain';

export interface ProcedureContext {
  adapter: TrackerAdapter;
  activity: ActivityStream;
  brain: AgentBrain;
  /** Multiplier on all simulated think time (1 = demo pace). */
  pace?: number;
  /** Read at resolve time so Settings changes apply to running sessions. */
  hitlTranscript?: () => HitlTranscriptMode;
  /** Actor id recorded as `decidedBy` on HITL decisions. */
  operator?: string;
}

export const think = (ctx: ProcedureContext, ms: number) => sleep(ms * (ctx.pace ?? 1) * (0.7 + Math.random() * 0.6));

/** Simulated per-token rates (USD); real agents report their own cost. */
const SIM_RATE = { input: 3 / 1e6, output: 15 / 1e6 };

/** Demo stand-in for agent usage reports: tokens accrue while the session works, not while it waits on you. */
export function meter(s: SessionHandle) {
  void (async () => {
    while (s.info.status === 'running') {
      await sleep(1000);
      if (s.info.status !== 'running' || s.info.waitingOn) continue;
      const inputTokens = Math.round(900 + Math.random() * 1800);
      const outputTokens = Math.round(40 + Math.random() * 160);
      s.usage({ inputTokens, outputTokens, costUsd: inputTokens * SIM_RATE.input + outputTokens * SIM_RATE.output });
    }
  })();
  return s;
}

export const agentSource = (s: SessionHandle) => ({
  kind: 'agent' as const,
  ref: s.id,
  label: `${s.info.agent} session`,
});
