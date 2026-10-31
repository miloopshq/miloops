import { postResponse } from '../api';
import {
  ACTIONS,
  VIEWS,
  helpText,
  replyModal,
  reworkModal,
  type ApprovalRef,
  type AskRef,
  type SaveMode,
} from '../blocks';
import { SAVE_DECISION_CALLBACK } from '../manifest';
import type { Envelope, EnvelopeResult } from '../socket';
import { plainText } from '../summary';
import { decideApproval } from './approvals';
import { answer, closeAsk, pendingAsk, writeAnswer } from './asks';
import { inboxMessage, statusMessage } from './commands';
import { REFUSED, ALREADY } from './constants';
import { changeMission, openDecision } from './decisionModal';
import { claim, publishHome } from './owner';
import { saveDecision } from './saveDecision';
import type { SlackContext } from './slackContext';
import type { Payload, DecisionMeta } from './types';

export async function onEnvelope(ctx: SlackContext, e: Envelope): Promise<EnvelopeResult | void> {
  const p = e.payload as Payload;
  if (e.type === 'events_api') {
    const ev = p.event as Payload | undefined;
    if (ev?.type === 'app_home_opened') return { after: () => publishHome(ctx, ev.user) };
    return;
  }
  if (e.type === 'slash_commands') return onCommand(ctx, p);
  if (p.type === 'message_action') return onShortcut(ctx, p);
  if (p.type === 'block_actions') return onAction(ctx, p);
  if (p.type === 'view_submission') return onSubmit(ctx, p);
}

export function onCommand(ctx: SlackContext, p: Payload): EnvelopeResult {
  const command = p.command as string;
  const [sub = '', ...rest] = String(p.text ?? '')
    .trim()
    .split(/\s+/);
  const arg = rest.join(' ').trim();
  const reply = (text: string) => ({ ack: { response_type: 'ephemeral', text } });
  if (!sub || sub === 'help') return reply(helpText(command));
  if (!ctx.allowed(p.user_id)) return reply(REFUSED);
  if (sub === 'decide') {
    const meta: DecisionMeta = { c: p.channel_id, cn: p.channel_name, u: p.user_id, w: p.team_id, r: p.response_url };
    return { after: () => openDecision(ctx, p.trigger_id, meta, arg) };
  }
  if (sub === 'status')
    return {
      after: async () =>
        postResponse(
          p.response_url,
          { response_type: 'ephemeral', ...(await statusMessage(ctx, arg, command)) },
          ctx.o.fetch,
        ),
    };
  if (sub === 'inbox')
    return {
      after: async () =>
        postResponse(p.response_url, { response_type: 'ephemeral', ...(await inboxMessage(ctx)) }, ctx.o.fetch),
    };
  return reply(`Unknown command \`${sub}\`.\n${helpText(command)}`);
}

export function onShortcut(ctx: SlackContext, p: Payload): EnvelopeResult | void {
  if (p.callback_id !== SAVE_DECISION_CALLBACK) return;
  if (!ctx.allowed(p.user.id))
    return { after: () => postResponse(p.response_url, { response_type: 'ephemeral', text: REFUSED }, ctx.o.fetch) };
  const msg = p.message as Payload;
  const meta: DecisionMeta = {
    c: p.channel.id,
    cn: p.channel.name,
    t: msg.thread_ts ?? msg.ts,
    m: msg.ts,
    u: p.user.id,
    w: p.team.id,
  };
  return { after: () => openDecision(ctx, p.trigger_id, meta, plainText(String(msg.text ?? ''))) };
}

export function onAction(ctx: SlackContext, p: Payload): EnvelopeResult | void {
  const a = (p.actions as Payload[])[0];
  const id = String(a?.action_id ?? '');
  const user = p.user.id as string;
  if (id === ACTIONS.claim) return { after: () => claim(ctx, user) };
  if (id === ACTIONS.missionPick && p.view) return { after: () => changeMission(ctx, p.view, a.selected_option.value) };
  if (id === ACTIONS.approve || id === ACTIONS.rework) return onApproval(ctx, p, id, String(a.value));
  if (id !== ACTIONS.reply && !id.startsWith(`${ACTIONS.option}:`)) return;
  const ephemeral = (text: string) =>
    postResponse(p.response_url, { response_type: 'ephemeral', replace_original: false, text }, ctx.o.fetch);
  if (!ctx.allowed(user)) return { after: () => ephemeral(REFUSED) };
  const ref = JSON.parse(a.value) as AskRef;
  return {
    after: async () => {
      const found = await pendingAsk(ctx, ref);
      if (!found) return ephemeral(ALREADY);
      if (id === ACTIONS.reply) {
        await ctx.call('views.open', {
          trigger_id: p.trigger_id,
          view: replyModal(found.view, JSON.stringify({ s: ref.s, q: ref.q })),
        });
        return;
      }
      const text = found.q.suggestions?.[ref.i ?? -1];
      if (text === undefined) return ephemeral(ALREADY);
      if (!(await answer(ctx, ref, text, user))) await ephemeral(ALREADY);
    },
  };
}

function onApproval(ctx: SlackContext, p: Payload, id: string, value: string): EnvelopeResult {
  const user = p.user.id as string;
  if (!ctx.allowed(user))
    return {
      after: () =>
        postResponse(
          p.response_url,
          { response_type: 'ephemeral', replace_original: false, text: REFUSED },
          ctx.o.fetch,
        ),
    };
  const ref = JSON.parse(value) as ApprovalRef;
  if (id === ACTIONS.approve)
    return { after: () => decideApproval(ctx, ref, user, { action: 'approve' }, p.response_url) };
  const item = [...ctx.approvals.values()].find((x) => x.item.ticketId === ref.t && x.item.mapId === ref.m)?.item;
  const meta = JSON.stringify({ ...ref, r: p.response_url });
  return {
    after: () =>
      ctx.call('views.open', {
        trigger_id: p.trigger_id,
        view: reworkModal(item ? `${item.ticketKey} ${item.title}` : ref.t, meta),
      }),
  };
}

export function onSubmit(ctx: SlackContext, p: Payload): EnvelopeResult | void {
  const view = p.view as Payload;
  const values = (view.state?.values ?? {}) as Record<string, Record<string, Payload>>;
  const user = p.user.id as string;
  if (view.callback_id === VIEWS.rework) {
    const meta = JSON.parse(view.private_metadata) as ApprovalRef & { r?: string };
    const reason = String(values.reason?.value?.value ?? '').trim();
    if (!reason) return { ack: { response_action: 'errors', errors: { reason: 'Say what has to change' } } };
    if (!ctx.allowed(user)) return { ack: { response_action: 'errors', errors: { reason: REFUSED } } };
    return { after: () => decideApproval(ctx, meta, user, { action: 'rework', reason }, meta.r) };
  }
  if (view.callback_id === VIEWS.reply) {
    const ref = JSON.parse(view.private_metadata) as AskRef;
    const text = String(values.answer?.value?.value ?? '').trim();
    if (!text) return { ack: { response_action: 'errors', errors: { answer: 'Enter an answer' } } };
    if (!ctx.allowed(user)) return { ack: { response_action: 'errors', errors: { answer: REFUSED } } };
    const ok = writeAnswer(ctx, ref, text, user);
    if (!ok) return { ack: { response_action: 'errors', errors: { answer: ALREADY } } };
    return { after: () => closeAsk(ctx, ref.q) };
  }
  if (view.callback_id !== VIEWS.decision) return;
  const meta = JSON.parse(view.private_metadata) as DecisionMeta;
  const decision = String(values.decision?.value?.value ?? '').trim();
  if (!decision) return { ack: { response_action: 'errors', errors: { decision: 'Enter the decision' } } };
  if (!ctx.allowed(user)) return { ack: { response_action: 'errors', errors: { decision: REFUSED } } };
  const mode = (values.mode?.value?.selected_option?.value ?? 'mission') as SaveMode;
  const ticketId = values.ticket?.value?.selected_option?.value as string | undefined;
  if (mode === 'resolve' && !ticketId)
    return { ack: { response_action: 'errors', errors: { ticket: 'Pick the ticket to resolve' } } };
  const mapId = meta.mid ?? (values.mission?.[ACTIONS.missionPick]?.selected_option?.value as string | undefined);
  if (!mapId) return { ack: { response_action: 'errors', errors: { decision: 'Pick a mission' } } };
  const summary = String(values.summary?.value?.value ?? '').trim();
  return { after: () => saveDecision(ctx, { meta, user, mapId, mode, ticketId, decision, summary }) };
}
