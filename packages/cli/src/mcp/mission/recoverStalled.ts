import type { AgentContext } from './agentContext';
import { recoverRuns } from './completion';

/** Expired claims of silent agents go back to the queue before work is picked. */
export async function recoverStalled(ctx: AgentContext) {
  await recoverRuns(ctx);
  const back = await ctx.leases.reclaim(ctx.adapter);
  return back.map((l) => ({
    ticket: l.ticketKey,
    from: l.agent,
    note: `returned to queue after ${l.agent} went silent`,
  }));
}
