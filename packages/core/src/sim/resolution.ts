import type { SessionHandle } from '../activity/sessionHandle';
import type { MapSnapshot, Ticket, TranscriptEntry } from '../model/types';
import type { DecisionMeta } from '../planning/operations/resolve';
import { agentSource, think, type ProcedureContext } from './procedureContext';

/** AFK: the agent resolves on its own, logging its trace. */
export async function afk(
  ctx: ProcedureContext,
  s: SessionHandle,
  t: Ticket,
  snap: MapSnapshot,
): Promise<{ answer: string; transcript?: string; decision: DecisionMeta }> {
  const { trace, answer, alternatives, rationale } = ctx.brain.resolve(t, snap);
  for (const line of trace) {
    await think(ctx, 1300);
    s.log(line);
  }
  return { answer, decision: { alternatives, rationale, source: agentSource(s) } };
}

/** HITL: the session blocks on the human for each question, then confirms a drafted resolution. The operator is who decided. */
export async function converse(
  ctx: ProcedureContext,
  s: SessionHandle,
  t: Ticket,
  snap: MapSnapshot,
  operator: string,
): Promise<{ answer: string; transcript?: string; decision: DecisionMeta }> {
  const c = ctx.brain.converse(t, snap);
  const log: TranscriptEntry[] = [];
  const agent = s.info.agent;
  const say = (text: string) => {
    log.push({ from: 'agent', author: agent, text, at: Date.now() });
    s.say(text);
  };
  const ask = async (text: string, suggestions?: string[]) => {
    log.push({ from: 'agent', author: agent, text, at: Date.now() });
    const a = await s.ask(text, suggestions);
    log.push({ from: 'human', author: operator, text: a, at: Date.now() });
    return a;
  };
  say(c.opening);
  await think(ctx, 600);
  const answers: string[] = [];
  for (const q of c.questions) {
    answers.push(await ask(q.text, q.suggestions));
    await think(ctx, 700);
  }
  let draft = c.draft(answers);
  const verdict = await ask(`Draft resolution:\n\n${draft}\n\nRecord this and close ${t.key}?`, [
    'Record it',
    'Add: revisit after beta',
  ]);
  if (!/^(y|yes|record|ok|ship)/i.test(verdict.trim())) draft = `${draft} Operator addendum: ${verdict.trim()}`;
  const full = (ctx.hitlTranscript?.() ?? 'summary') === 'full';
  say(`Recording resolution on ${t.key}${full ? ' with the full transcript' : ''} and closing it.`);
  const k = c.decisive ?? 0;
  const alternatives = (c.questions[k]?.suggestions ?? []).filter((x) => x !== answers[k]);
  return {
    answer: draft,
    transcript: full ? log.map((e) => `**${e.author}:** ${e.text}`).join('\n\n') : undefined,
    decision: {
      alternatives,
      rationale: c.rationale?.(answers) ?? '',
      decidedBy: operator,
      participants: [{ id: agent }, { id: operator }],
      source: { kind: 'command-center', ref: s.id, label: `${agent} conversation` },
      transcript: log,
    },
  };
}
