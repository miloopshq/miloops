import { OperationError } from '@miloops-hq/core';
import { readAgentDocs, writeAgentAnswer } from '@miloops-hq/core/agents';
import type { AgentContext } from './agentContext';
import { callsignFamily } from './callsign';
import { OPERATOR, type AskResult, type WaitControl } from './types';

export async function ask(
  ctx: AgentContext,
  input: { question: string; suggestions?: string[]; waitSeconds?: number; framing?: boolean },
  ctl: WaitControl = {},
): Promise<AskResult> {
  const s = input.framing ? await ctx.chartSession() : await ctx.ensureSession();
  if (input.framing && s.info.step === 0) s.step(1, 'framing interview');
  ctx.sessions.note(s, 'agent', s.info.agent, input.question);
  const answer = s.ask(input.question, input.suggestions?.length ? input.suggestions : undefined);
  const q = ctx.activity.snapshot.pending.filter((p) => p.sessionId === s.id).at(-1)!;
  ctx.writer.flush();
  const sid = s.id;
  ctx.waits.set(
    q.id,
    answer.then((text) => {
      const author =
        [...ctx.activity.snapshot.chats].reverse().find((c) => c.sessionId === sid && c.from === 'human')?.author ??
        OPERATOR;
      ctx.sessions.transcript(sid)?.push({ from: 'human', author, text, at: Date.now() });
      return { text, author };
    }),
  );
  return waitForAnswer(ctx, { questionId: q.id, waitSeconds: input.waitSeconds }, ctl);
}

export async function waitForAnswer(
  ctx: AgentContext,
  input: { questionId: string; waitSeconds?: number },
  ctl: WaitControl = {},
): Promise<AskResult> {
  const p = ctx.waits.get(input.questionId);
  if (!p)
    throw new OperationError(
      `Unknown question ${input.questionId} (questions only live as long as the session that asked them)`,
    );
  const started = Date.now();
  const waited = () => Math.round((Date.now() - started) / 1000);
  const limit = Math.max(0, input.waitSeconds ?? defaultWaitSeconds(ctx)) * 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tick: ReturnType<typeof setInterval> | undefined;
  let onAbort = () => {};
  const res = await Promise.race([
    p.then((a) => ({ answered: true as const, a })),
    new Promise<{ answered: false }>((r) => {
      timer = setTimeout(() => r({ answered: false }), limit);
      onAbort = () => r({ answered: false });
      ctl.signal?.addEventListener('abort', onAbort, { once: true });
      if (ctl.onProgress) tick = setInterval(() => ctl.onProgress!(waited()), 15_000);
    }),
  ]).finally(() => {
    clearTimeout(timer);
    clearInterval(tick);
    ctl.signal?.removeEventListener('abort', onAbort);
  });
  if (!res.answered) return { answered: false, questionId: input.questionId, waitedSeconds: waited() };
  ctx.waits.delete(input.questionId);
  return {
    answered: true,
    questionId: input.questionId,
    answer: res.a.text,
    answeredBy: res.a.author,
    waitedSeconds: waited(),
  };
}

export function defaultWaitSeconds(ctx: AgentContext) {
  return callsignFamily(ctx.opts.client?.()) === 'codex' ? 50 : 600;
}

export async function inbox(ctx: AgentContext) {
  const docs = await readAgentDocs(ctx.root);
  const maps = new Map((await ctx.adapter.listMaps()).map((m) => [m.id, m]));
  return {
    questions: docs
      .flatMap((d) => d.pending.map((q) => ({ q, d })))
      .sort((a, b) => a.q.at - b.q.at)
      .map(({ q, d }) => ({
        questionId: q.id,
        sessionId: q.sessionId,
        agent: q.agent,
        mission: maps.get(q.mapId)?.title ?? (q.mapId ? q.mapId : 'new mission (framing)'),
        ticket: q.ticketId ? ctx.keyOf(q.ticketId) : undefined,
        question: q.text,
        suggestions: q.suggestions,
        askedSecondsAgo: Math.round((Date.now() - q.at) / 1000),
        step: d.session.stepLabel,
      })),
    commandCenter: ctx.commandCenter(),
  };
}

export async function answerQuestion(ctx: AgentContext, input: { questionId: string; answer: string }) {
  const own = ctx.activity.snapshot.pending.find((p) => p.id === input.questionId);
  if (own) {
    ctx.activity.answer(own.id, input.answer.trim(), OPERATOR);
    return { delivered: true, to: own.agent };
  }
  const doc = (await readAgentDocs(ctx.root)).find((d) => d.pending.some((q) => q.id === input.questionId));
  if (!doc) throw new OperationError(`No open question ${input.questionId}. Call list_inbox for the current ones.`);
  writeAgentAnswer(ctx.root, {
    sessionId: doc.session.id,
    questionId: input.questionId,
    text: input.answer,
    author: OPERATOR,
  });
  return { delivered: true, to: doc.session.agent };
}
