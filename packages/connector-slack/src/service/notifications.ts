import type { AgentSessionDoc, MapSnapshot } from '@miloops-hq/core';
import { readAgentDocs } from '@miloops-hq/core/bridge';
import type { SlackConfig } from '../store';
import { syncApprovals } from './approvals';
import { syncAsks } from './asks';
import { day } from './constants';
import { missionChanges, notesOf } from './missionChanges';
import type { SlackContext } from './slackContext';

export function tick(ctx: SlackContext): Promise<void> {
  ctx.ticking ??= runTick(ctx).finally(() => (ctx.ticking = undefined));
  return ctx.ticking;
}

export async function runTick(ctx: SlackContext) {
  const c = ctx.store.read();
  if (ctx.state !== 'online' || !c.owners.length || !ctx.bot) return;
  try {
    const docs = await readAgentDocs(ctx.o.root);
    await syncAsks(ctx, docs, c);
    if (ctx.ticks++ % (ctx.o.missionEvery ?? 5) === 0) await syncMissions(ctx, docs, c);
    await flushBatches(ctx);
  } catch {
    /* Slack or the tracker is unreachable: try again on the next tick */
  }
}

export async function syncMissions(ctx: SlackContext, docs: AgentSessionDoc[], c: SlackConfig) {
  const adapter = await ctx.o.active();
  const ev = new Set(c.notify.events);
  const snaps: MapSnapshot[] = [];
  for (const m of await adapter.listMaps()) {
    const snap = await adapter.loadMap(m.id);
    snaps.push(snap);
    const now = notesOf(snap);
    const prev = ctx.missions.get(m.id);
    ctx.missions.set(m.id, now);
    if (!prev) continue;
    for (const line of missionChanges({ snap, docs, prev, now, events: ev })) queue(ctx, m.id, line);
  }
  await syncApprovals(ctx, snaps, c);
}

export function queue(ctx: SlackContext, mapId: string, line: string) {
  const b = ctx.batches.get(mapId) ?? { lines: [], lastAt: 0 };
  b.lines.push(line);
  ctx.batches.set(mapId, b);
}

/** One message per mission per window; later ones thread under that day's first message for the mission. */
export async function flushBatches(ctx: SlackContext) {
  const now = Date.now();
  for (const b of ctx.batches.values()) {
    if (!b.lines.length || now - b.lastAt < (ctx.o.batchMs ?? 30_000)) continue;
    const channel = await ctx.target();
    if (!channel) return;
    const text = b.lines.join('\n');
    const today = day(now);
    const thread = b.root?.day === today ? b.root.ts : undefined;
    const r = await ctx.call<{ ts: string }>('chat.postMessage', {
      channel,
      text,
      ...(thread ? { thread_ts: thread } : {}),
    });
    if (!thread) b.root = { day: today, ts: r.ts };
    b.lines = [];
    b.lastAt = now;
  }
}
