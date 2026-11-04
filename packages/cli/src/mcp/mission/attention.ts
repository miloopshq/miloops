import type { AttentionItem, AttentionKind, MapSummary } from '@miloops-hq/core';
import { attentionView } from '@miloops-hq/core/agents';
import type { AgentContext } from './agentContext';

/** An attention item as agents read it: mission and ticket by their human keys. */
function itemView(i: AttentionItem, maps: Map<string, MapSummary>, keyOf: (id: string) => string) {
  const mission = maps.get(i.mapId);
  return {
    id: i.id,
    kind: i.kind,
    title: i.title,
    urgency: i.urgency,
    score: i.score,
    reasons: i.reasons,
    batch: i.batchKey,
    mission: mission ? `${mission.key} ${mission.title}` : undefined,
    ticket: i.ticketId ? keyOf(i.ticketId) : undefined,
    agent: i.agent,
    waitingSeconds: Math.max(0, Math.round((Date.now() - i.since) / 1000)),
    ...(i.kind === 'question' ? { questionId: i.ref } : {}),
  };
}

/** The ranked attention queue, best first, optionally only some kinds. */
export async function rankedAttention(ctx: AgentContext, kinds?: AttentionKind[]) {
  const view = await attentionView({ root: ctx.root, adapter: ctx.adapter });
  const maps = new Map((await ctx.adapter.listMaps()).map((m) => [m.id, m]));
  const wanted = kinds?.length ? view.items.filter((i) => kinds.includes(i.kind)) : view.items;
  return {
    items: wanted.map((i) => itemView(i, maps, (id) => ctx.keyOf(id))),
    interrupting: view.interrupting.length,
    focused: view.focused,
  };
}

/** `status.attention`: how much needs the human, how much interrupts, and the top three. */
export async function attentionSummary(ctx: AgentContext) {
  const ranked = await rankedAttention(ctx);
  return { count: ranked.items.length, interrupting: ranked.interrupting, top: ranked.items.slice(0, 3) };
}
