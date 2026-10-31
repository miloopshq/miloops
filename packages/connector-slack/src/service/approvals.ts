import type { ApprovalItem, MapSnapshot } from '@miloops-hq/core';
import { approvalItems, journalFile, operatorAction } from '@miloops-hq/core/agents';
import { postResponse } from '../api';
import { approvalClosedMessage, approvalMessage, type ApprovalRef } from '../blocks';
import type { SlackConfig } from '../store';
import type { SlackContext } from './slackContext';

const keyOf = (i: Pick<ApprovalItem, 'mapId' | 'ticketId' | 'attemptId' | 'kind'>) =>
  `${i.mapId}/${i.ticketId}/${i.attemptId ?? ''}/${i.kind}`;

/**
 * Posts each ticket that starts waiting on the operator (a reviewed pass to
 * approve, a held ticket) once, and strips the buttons when it stops waiting.
 * Part of the "awaiting" notifications.
 */
export async function syncApprovals(ctx: SlackContext, snaps: MapSnapshot[], c: SlackConfig) {
  if (!c.notify.events.includes('awaiting')) return;
  const now = new Map<string, { item: ApprovalItem; mission: string }>();
  for (const s of snaps)
    for (const i of approvalItems(ctx.o.root, s)) now.set(keyOf(i), { item: i, mission: s.map.title });
  for (const [key, posted] of ctx.approvals)
    if (!now.has(key)) {
      await ctx.call('chat.update', {
        channel: posted.channel,
        ts: posted.ts,
        ...approvalClosedMessage(posted.mission, posted.item, 'No longer waiting on you.'),
      });
      ctx.approvals.delete(key);
    }
  for (const [key, { item, mission }] of now) {
    if (ctx.approvals.has(key)) continue;
    const channel = await ctx.target();
    if (!channel) return;
    const r = await ctx.call<{ ts: string; channel: string }>('chat.postMessage', {
      channel,
      ...approvalMessage(mission, item, ctx.o.url()),
    });
    ctx.approvals.set(key, { channel: r.channel ?? channel, ts: r.ts, item, mission });
  }
}

/** Approve or send back to rework from Slack, as the operator would in the command center. */
export async function decideApproval(
  ctx: SlackContext,
  ref: ApprovalRef,
  user: string,
  d: { action: 'approve' } | { action: 'rework'; reason: string },
  responseUrl?: string,
) {
  const say = (text: string) =>
    responseUrl
      ? postResponse(responseUrl, { response_type: 'ephemeral', replace_original: false, text }, ctx.o.fetch)
      : Promise.resolve();
  const env = { adapter: await ctx.o.active(), root: ctx.o.root, journal: journalFile(ctx.o.root) };
  try {
    await operatorAction(env, {
      action: d.action,
      mapId: ref.m,
      ticketId: ref.t,
      by: `slack:${user}`,
      ...(d.action === 'rework' ? { reason: d.reason } : {}),
    });
  } catch (e) {
    return say(`Could not ${d.action}: ${(e as Error).message}`);
  }
  for (const [key, posted] of ctx.approvals)
    if (posted.item.mapId === ref.m && posted.item.ticketId === ref.t) {
      const line =
        d.action === 'approve'
          ? `✓ Approved by <@${user}> via Slack.`
          : `↺ Sent back to rework by <@${user}> via Slack.`;
      await ctx.call('chat.update', {
        channel: posted.channel,
        ts: posted.ts,
        ...approvalClosedMessage(posted.mission, posted.item, line),
      });
      ctx.approvals.delete(key);
    }
}
