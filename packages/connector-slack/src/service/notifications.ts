import { deriveStates, type AgentSessionDoc, type MapSnapshot } from '@miloops-hq/core';
import { readAgentDocs } from '@miloops-hq/core/bridge';
import { escape } from '../blocks';
import { briefMission, formatTokens } from '../status';
import type { SlackConfig } from '../store';
import { syncApprovals } from './approvals';
import { syncAsks } from './asks';
import { day } from './constants';
import type { SlackContext } from './slackContext';
import type { MissionNotes } from './types';

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
    const states = deriveStates(snap.tickets, snap.map.mode);
    const byId = new Map(snap.tickets.map((t) => [t.id, t]));
    const now: MissionNotes = {
      known: new Set(snap.tickets.map((t) => t.id)),
      blocked: new Set(snap.tickets.filter((t) => states.get(t.id) === 'blocked').map((t) => t.id)),
      closed: new Set(snap.tickets.filter((t) => t.state === 'closed').map((t) => t.id)),
      done: snap.tickets.length > 0 && snap.tickets.every((t) => t.state === 'closed'),
    };
    const prev = ctx.missions.get(m.id);
    ctx.missions.set(m.id, now);
    if (!prev) continue;
    const title = escape(snap.map.title);
    if (ev.has('blocked'))
      for (const id of now.blocked)
        if (prev.known.has(id) && !prev.blocked.has(id)) {
          const t = byId.get(id)!;
          const by = t.blockedBy
            .map((b) => byId.get(b))
            .filter((b) => b && b.state === 'open')
            .map((b) => `${b!.key} ${b!.title}`);
          queue(
            ctx,
            m.id,
            `⛔ *BLOCKED* · ${title} · ${escape(t.key)} ${escape(t.title)}${by.length ? ` is blocked by ${escape(by.join(', '))}` : ''}`,
          );
        }
    if (ev.has('resolved'))
      for (const id of now.closed)
        if (!prev.closed.has(id) && byId.get(id)?.closeReason === 'completed') {
          const t = byId.get(id)!;
          const unblocked = [...prev.blocked].filter(
            (b) => !now.blocked.has(b) && byId.get(b)?.state === 'open' && byId.get(b)?.blockedBy.includes(id),
          ).length;
          queue(
            ctx,
            m.id,
            `✓ *RESOLVED* · ${title} · ${escape(t.key)} ${escape(t.title)}${unblocked ? ` → ${unblocked} ticket${unblocked === 1 ? '' : 's'} unblocked` : ''}`,
          );
        }
    if (ev.has('mission.done') && now.done && !prev.done) {
      const b = briefMission(snap, docs);
      queue(
        ctx,
        m.id,
        `◉ *MISSION DONE* · ${title} · ${b.total} tickets · $${b.costUsd.toFixed(2)} · ${formatTokens(b.tokens)} tokens`,
      );
    }
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
