import { BRAND, type AgentSessionDoc, type PendingQuestion, type TrackerAdapter } from '@miloops-hq/core';
import { AnswerError, readAgentDocs, writeAgentAnswer } from '@miloops-hq/core/bridge';
import { askClosedMessage, askMessage, clip, escape, type AskRef, type AskView } from '../blocks';
import type { SlackConfig } from '../store';
import type { SlackContext } from './slackContext';

export async function askView(
  ctx: SlackContext,
  q: PendingQuestion,
  adapter?: TrackerAdapter,
): Promise<AskView & { mapId: string; ticketId?: string; at: number }> {
  let mission: string | undefined;
  let ticket: string | undefined;
  try {
    const snap = await (adapter ?? (await ctx.o.active())).loadMap(q.mapId);
    mission = snap.map.title;
    const t = snap.tickets.find((x) => x.id === q.ticketId);
    ticket = t ? `${t.key} ${t.title}` : undefined;
  } catch {
    /* mission unknown to the active tracker: show the ask without it */
  }
  return {
    sessionId: q.sessionId,
    questionId: q.id,
    text: q.text,
    suggestions: q.suggestions,
    agent: q.agent,
    mission,
    ticket,
    mapId: q.mapId,
    ticketId: q.ticketId,
    at: q.at,
  };
}

export async function pendingAsk(ctx: SlackContext, ref: AskRef) {
  const docs = await readAgentDocs(ctx.o.root);
  const q = docs.find((d) => d.session.id === ref.s)?.pending.find((x) => x.id === ref.q);
  return q ? { q, view: await askView(ctx, q) } : undefined;
}

/** Compare-and-set: only the first answer to an open question is delivered. */
export function writeAnswer(ctx: SlackContext, ref: AskRef, text: string, user: string) {
  if (ctx.answering.has(ref.q)) return false;
  ctx.answering.add(ref.q);
  try {
    writeAgentAnswer(ctx.o.root, { sessionId: ref.s, questionId: ref.q, text, author: `slack:${user}` });
  } catch (e) {
    if (e instanceof AnswerError) return false;
    ctx.answering.delete(ref.q);
    throw e;
  }
  const asks = ctx.asks.read();
  if (asks[ref.q]) {
    asks[ref.q].by = { user, text };
    ctx.asks.write(asks);
  }
  return true;
}

export async function answer(ctx: SlackContext, ref: AskRef, text: string, user: string) {
  if (!writeAnswer(ctx, ref, text, user)) return false;
  await closeAsk(ctx, ref.q);
  return true;
}

/** Replace the ask's buttons with its outcome. */
export async function closeAsk(ctx: SlackContext, questionId: string, docs?: AgentSessionDoc[]) {
  const asks = ctx.asks.read();
  const rec = asks[questionId];
  if (!rec || rec.closed || !rec.view) return;
  let line: string;
  let answered = true;
  if (rec.by)
    line = `✓ Answered by <@${rec.by.user}> via Slack: “${escape(clip(rec.by.text, 300))}”. ${escape(rec.view.agent)} resumed.`;
  else {
    const doc = (docs ?? (await readAgentDocs(ctx.o.root))).find((d) => d.session.id === rec.sessionId);
    const reply = doc?.chats.find((c) => c.from === 'human' && c.at >= rec.view!.at);
    answered = !!reply;
    line = reply
      ? `✓ Answered in ${BRAND.name} by ${escape(reply.author)}: “${escape(clip(reply.text, 300))}”.`
      : `No longer waiting: ${escape(rec.view.agent)} ${doc?.session.status === 'running' ? 'withdrew the question' : 'session ended'}.`;
  }
  rec.closed = true;
  ctx.asks.write(asks);
  const detail = ctx.store.read().notify.detail;
  await ctx
    .call('chat.update', {
      channel: rec.channel,
      ts: rec.ts,
      ...askClosedMessage(rec.view, line, { detail, answered }),
    })
    .catch(() => {});
}

export async function syncAsks(ctx: SlackContext, docs: AgentSessionDoc[], c: SlackConfig) {
  const asks = ctx.asks.read();
  const open = new Set<string>();
  let adapter: TrackerAdapter | undefined;
  for (const d of docs)
    for (const q of d.pending) {
      open.add(q.id);
      if (asks[q.id] || !c.notify.events.includes('awaiting')) continue;
      const channel = await ctx.target();
      if (!channel) return;
      adapter ??= await ctx.o.active();
      const view = await askView(ctx, q, adapter);
      const r = await ctx.call<{ channel: string; ts: string }>('chat.postMessage', {
        channel,
        ...askMessage(view, { url: ctx.o.url(), detail: c.notify.detail }),
      });
      asks[q.id] = { sessionId: q.sessionId, channel: r.channel, ts: r.ts, view };
      ctx.asks.write(asks);
    }
  for (const [id, rec] of Object.entries(asks)) if (!rec.closed && !open.has(id)) await closeAsk(ctx, id, docs);
}
