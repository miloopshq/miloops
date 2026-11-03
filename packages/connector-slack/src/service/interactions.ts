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
import { decideApproval, waitingApproval } from './approvals';
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
    return { after: () => decideApproval(ctx, { ref, user, responseUrl: p.response_url }, { action: 'approve' }) };
  const meta = JSON.stringify({ ...ref, r: p.response_url });
  return {
    after: async () => {
      const item = await waitingApproval(ctx, ref, 'rework', p.response_url);
      if (item)
        await ctx.call('views.open', {
          trigger_id: p.trigger_id,
          view: reworkModal(`${item.ticketKey} ${item.title}`, meta),
        });
    },
  };
}

type Values = Record<string, Record<string, Payload>>;

/** A modal field's error, shown under that field. */
const fieldError = (field: string, message: string): EnvelopeResult => ({
  ack: { response_action: 'errors', errors: { [field]: message } },
});
const textOf = (values: Values, block: string) => String(values[block]?.value?.value ?? '').trim();

export function onSubmit(ctx: SlackContext, p: Payload): EnvelopeResult | void {
  const view = p.view as Payload;
  const values = (view.state?.values ?? {}) as Values;
  const user = p.user.id as string;
  if (view.callback_id === VIEWS.rework) return submitRework(ctx, { view, values, user });
  if (view.callback_id === VIEWS.reply) return submitReply(ctx, { view, values, user });
  if (view.callback_id === VIEWS.decision) return submitDecision(ctx, { view, values, user });
}

type Submitted = { view: Payload; values: Values; user: string };

function submitRework(ctx: SlackContext, { view, values, user }: Submitted): EnvelopeResult {
  const meta = JSON.parse(view.private_metadata) as ApprovalRef & { r?: string };
  const reason = textOf(values, 'reason');
  if (!reason) return fieldError('reason', 'Say what has to change');
  if (!ctx.allowed(user)) return fieldError('reason', REFUSED);
  return { after: () => decideApproval(ctx, { ref: meta, user, responseUrl: meta.r }, { action: 'rework', reason }) };
}

function submitReply(ctx: SlackContext, { view, values, user }: Submitted): EnvelopeResult {
  const ref = JSON.parse(view.private_metadata) as AskRef;
  const text = textOf(values, 'answer');
  if (!text) return fieldError('answer', 'Enter an answer');
  if (!ctx.allowed(user)) return fieldError('answer', REFUSED);
  const ok = writeAnswer(ctx, ref, text, user);
  if (!ok) return fieldError('answer', ALREADY);
  return { after: () => closeAsk(ctx, ref.q) };
}

function submitDecision(ctx: SlackContext, { view, values, user }: Submitted): EnvelopeResult {
  const meta = JSON.parse(view.private_metadata) as DecisionMeta;
  const decision = textOf(values, 'decision');
  if (!decision) return fieldError('decision', 'Enter the decision');
  if (!ctx.allowed(user)) return fieldError('decision', REFUSED);
  const picked = (block: string, action = 'value') =>
    values[block]?.[action]?.selected_option?.value as string | undefined;
  const mode = (picked('mode') ?? 'mission') as SaveMode;
  const ticketId = picked('ticket');
  if (mode === 'resolve' && !ticketId) return fieldError('ticket', 'Pick the ticket to resolve');
  const mapId = meta.mid ?? picked('mission', ACTIONS.missionPick);
  if (!mapId) return fieldError('decision', 'Pick a mission');
  const summary = textOf(values, 'summary');
  return { after: () => saveDecision(ctx, { meta, user, mapId, mode, ticketId, decision, summary }) };
}
