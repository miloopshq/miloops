import type { SessionHandle } from '../activity/sessionHandle';
import { sleep } from '../lib/emitter';
import { PRIMARY_AGENT } from '../model/integrations';
import type { MapMode, TicketType } from '../model/types';
import { attention } from '../planning/derive';
import { chartMap } from '../planning/operations/chart';
import { chooseNext, claim } from '../planning/operations/claims';
import { OperationError } from '../planning/operations/operationError';
import { resolve } from '../planning/operations/resolve';
import { promoteToTicket, ruleOutOfScope } from '../planning/operations/scope';
import { agentSource, meter, think, type ProcedureContext } from './procedureContext';
import { afk, converse } from './resolution';

export type { ProcedureContext } from './procedureContext';

/** Research subagents fired by a chart session, e.g. claude-r1. */
const researchCallsign = (n: number) => `${PRIMARY_AGENT.callsign}-r${n}`;

/** "Chart the map": name destination, map frontier, create map, create tickets then wire blocking, fire research. */
export async function runChart(
  ctx: ProcedureContext,
  input: {
    title: string;
    destination: string;
    notes?: string;
    agent: string;
    mode?: MapMode;
    onMap?: (mapId: string) => void;
  },
) {
  const s = meter(ctx.activity.startSession({ agent: input.agent, mode: 'chart', mapId: '' }));
  try {
    s.step(1, input.destination);
    await think(ctx, 1400);
    s.step(2, 'proposing decision tickets');
    const proposed = await ctx.brain.planMap(input);
    const plan = {
      ...proposed,
      mode: input.mode,
      sections: { ...proposed.sections, notes: input.notes?.trim() || proposed.sections.notes },
    };
    s.log(`mission mode · ${input.mode ?? 'plan+execute'}`);
    for (const t of plan.tickets.filter((x) => input.mode !== 'plan-only' || x.type !== 'execute')) {
      s.log(`proposed ${t.type} · ${t.title}`);
      await think(ctx, 260);
    }
    s.step(3, plan.title);
    const research: string[] = [];
    let mapId = '';
    await chartMap(ctx.adapter, plan, {
      onMapCreated: async (m) => {
        mapId = m.id;
        s.bindMap(m.id);
        input.onMap?.(m.id);
        s.log(`mission ${m.key} online`, 'ok');
        await think(ctx, 700);
        s.step(4, `${plan.tickets.length} tickets`);
      },
      onTicketCreated: async (t) => {
        if (t.type === 'research') {
          // Reserved for a research subagent at once so parallel sessions cannot take it.
          research.push(t.id);
          await ctx.adapter.assign(mapId, t.id, researchCallsign(research.length));
        }
        await think(ctx, 380);
      },
      onEdgeWired: async () => think(ctx, 240),
    });
    s.step(5, `${research.length} research subagents`);
    const fired = research.map((id, i) => ({ id, agent: researchCallsign(i + 1) }));
    await think(ctx, 600);
    s.done(true, `Mission launched · ${plan.tickets.length} tickets`, { signal: true });
    await Promise.all(
      fired.map((r, i) => sleep(i * 900).then(() => runResearch(ctx, { mapId, ticketId: r.id, agent: r.agent }))),
    );
    return mapId;
  } catch (err) {
    s.log(String((err as Error).message ?? err), 'alert');
    s.done(false);
    throw err;
  }
}

/** Research subagent fired at chart time: claim, investigate, record. */
export async function runResearch(ctx: ProcedureContext, input: { mapId: string; ticketId: string; agent: string }) {
  const s = meter(
    ctx.activity.startSession({ agent: input.agent, mode: 'research', mapId: input.mapId, ticketId: input.ticketId }),
  );
  try {
    const pre = (await ctx.adapter.loadMap(input.mapId)).tickets.find((x) => x.id === input.ticketId);
    const t = pre?.assignee === input.agent ? pre : await claim(ctx.adapter, input.mapId, input.ticketId, input.agent);
    s.step(1, t.key, t.id);
    const snap = await ctx.adapter.loadMap(input.mapId);
    const { trace, answer, alternatives, rationale } = ctx.brain.resolve(t, snap);
    s.step(2, t.title);
    for (const line of trace) {
      await think(ctx, 1200);
      s.log(line);
    }
    s.step(3, `${t.key} decided`);
    await resolve(ctx.adapter, input.mapId, t.id, {
      answer,
      author: input.agent,
      decision: { alternatives, rationale, source: agentSource(s) },
    });
    s.done(true);
  } catch (err) {
    s.log(String((err as Error).message ?? err), 'alert');
    s.done(false);
  }
}

/** "Work through the map": load, claim one frontier ticket, resolve by type, record, update the unspecified list. */
export async function runWork(
  ctx: ProcedureContext,
  input: { mapId: string; agent: string; ticketId?: string; types?: TicketType[]; exclude?: string[] },
) {
  const s: SessionHandle = meter(ctx.activity.startSession({ agent: input.agent, mode: 'work', mapId: input.mapId }));
  try {
    s.step(1, 'reading mission + tickets');
    let snap = await ctx.adapter.loadMap(input.mapId);
    await think(ctx, 900);
    const target = input.ticketId ? snap.tickets.find((t) => t.id === input.ticketId) : chooseNext(snap, input);
    if (!target) {
      s.done(true, 'Frontier empty · nothing to claim');
      return;
    }
    const t = target.assignee === input.agent ? target : await claim(ctx.adapter, input.mapId, target.id, input.agent);
    s.step(2, `${t.key} ${t.title}`, t.id);
    await think(ctx, 900);
    snap = await ctx.adapter.loadMap(input.mapId);
    const hitl = attention(t) === 'hitl';
    s.step(3, `${t.key} ${t.type} · ${hitl ? 'with you' : 'agent only'}`);
    const { answer, transcript, decision } = hitl
      ? await converse(ctx, s, t, snap, ctx.operator ?? 'operator')
      : await afk(ctx, s, t, snap);
    s.step(4, `${transcript ? 'transcript + ' : ''}comment + close + record decision`);
    await resolve(ctx.adapter, input.mapId, t.id, { answer, transcript, author: input.agent, decision });
    await think(ctx, 700);
    s.step(5);
    snap = await ctx.adapter.loadMap(input.mapId);
    const move = ctx.brain.planMove(snap);
    if (move?.kind === 'graduate') {
      const nt = await promoteToTicket(ctx.adapter, input.mapId, move.unspecified, {
        type: move.type,
        blockedBy: move.blockedBy,
      });
      s.log(`promoted to ${nt.key} · ${move.unspecified}`, 'ok');
    } else if (move?.kind === 'rule') {
      await ruleOutOfScope(
        ctx.adapter,
        input.mapId,
        { unspecified: move.unspecified },
        { reason: move.reason, author: input.agent, source: agentSource(s) },
      );
      s.log(`ruled out of scope · ${move.unspecified}`, 'warn');
    } else {
      s.log('plan unchanged');
    }
    s.done(true, `${t.key} decided · session closed`);
  } catch (err) {
    const msg = err instanceof OperationError ? err.message : String((err as Error).message ?? err);
    s.log(msg, 'alert');
    s.done(false, 'Claim lost · session aborted');
  }
}
