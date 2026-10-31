import { BRAND } from '@miloops-hq/core';

/** Block Kit for every surface MILO renders in Slack. Pure functions; no I/O. */

type Block = Record<string, unknown>;

const plain = (text: string, emoji = true) => ({ type: 'plain_text', text, emoji });
const md = (text: string) => ({ type: 'mrkdwn', text });
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const quote = (s: string) => escape(s).split('\n').map((l) => `>${l}`).join('\n');

export const ACTIONS = {
  claim: 'claim_owner',
  option: 'ask_option',
  reply: 'ask_reply',
  open: 'open_miloops',
  missionPick: 'mission_pick',
} as const;

export const VIEWS = { decision: 'decision_modal', reply: 'ask_reply_modal' } as const;

const openButton = (url: string | undefined): Block[] => (url ? [{ type: 'button', action_id: ACTIONS.open, text: plain(`Open in ${BRAND.name}`), url }] : []);

/* ---------- agent asks ---------- */

export interface AskView {
  sessionId: string;
  questionId: string;
  text: string;
  suggestions?: string[];
  agent: string;
  mission?: string;
  ticket?: string;
}

export interface AskRef {
  s: string;
  q: string;
  i?: number;
}

const askHeader = (a: AskView) => ['◆ *AWAITING YOU*', a.mission && escape(a.mission), a.ticket && escape(a.ticket), escape(a.agent)].filter(Boolean).join(' · ');

export function askMessage(a: AskView, o: { url?: string; detail?: 'full' | 'titles-only' } = {}) {
  const ref = (i?: number) => JSON.stringify({ s: a.sessionId, q: a.questionId, ...(i === undefined ? {} : { i }) } satisfies AskRef);
  const body = o.detail === 'titles-only' ? askHeader(a) : `${askHeader(a)}\n${quote(clip(a.text, 2800))}`;
  const options = (a.suggestions ?? []).slice(0, 4).map((s, i) => ({ type: 'button', action_id: `${ACTIONS.option}:${i}`, text: plain(clip(s, 75)), value: ref(i) }));
  return {
    text: `Awaiting you · ${a.agent}: ${clip(a.text, 140)}`,
    blocks: [
      { type: 'section', text: md(body) },
      { type: 'actions', block_id: `ask:${a.questionId}`, elements: [...options, { type: 'button', action_id: ACTIONS.reply, text: plain('Reply…'), value: ref() }, ...openButton(o.url)] },
    ],
  };
}

export function askClosedMessage(a: AskView, line: string, o: { detail?: 'full' | 'titles-only'; answered?: boolean } = {}) {
  const head = askHeader(a).replace('◆ *AWAITING YOU*', o.answered === false ? '◇ *CLOSED*' : '◇ *ANSWERED*');
  const body = o.detail === 'titles-only' ? head : `${head}\n${quote(clip(a.text, 2800))}`;
  return {
    text: line,
    blocks: [
      { type: 'section', text: md(body) },
      { type: 'context', elements: [md(line)] },
    ],
  };
}

export function replyModal(a: AskView, meta: string) {
  return {
    type: 'modal',
    callback_id: VIEWS.reply,
    private_metadata: meta,
    title: plain('Reply'),
    submit: plain('Send'),
    close: plain('Cancel'),
    blocks: [
      { type: 'context', elements: [md(`${escape(a.agent)}${a.ticket ? ` · ${escape(a.ticket)}` : ''}`)] },
      { type: 'section', text: md(quote(clip(a.text, 2800))) },
      { type: 'input', block_id: 'answer', label: plain('Answer'), element: { type: 'plain_text_input', action_id: 'value', multiline: true } },
    ],
  };
}

/* ---------- decisions ---------- */

export type SaveMode = 'resolve' | 'mission' | 'new';

export interface DecisionForm {
  missions: { id: string; label: string }[];
  mapId?: string;
  tickets: { id: string; label: string }[];
  ticketId?: string;
  mode: SaveMode;
  decision: string;
  summary: string;
  thread?: { channel?: string; count: number; participants: string[]; permalink?: string };
  postsTo?: string;
  notice?: string;
}

const option = (o: { id: string; label: string }) => ({ text: plain(clip(o.label, 75)), value: o.id });

export function loadingModal(meta: string) {
  return {
    type: 'modal',
    callback_id: VIEWS.decision,
    private_metadata: meta,
    title: plain('Save as decision'),
    close: plain('Cancel'),
    blocks: [{ type: 'section', text: md('_Reading the thread…_') }],
  };
}

export function noticeModal(meta: string, text: string) {
  return {
    type: 'modal',
    callback_id: VIEWS.decision,
    private_metadata: meta,
    title: plain('Save as decision'),
    close: plain('Close'),
    blocks: [{ type: 'section', text: md(text) }],
  };
}

export function decisionModal(f: DecisionForm, meta: string) {
  const blocks: Block[] = [];
  if (f.notice) blocks.push({ type: 'context', elements: [md(f.notice)] });
  const mission = f.missions.find((m) => m.id === f.mapId);
  blocks.push({
    type: 'section',
    block_id: 'mission',
    text: md('*Mission*'),
    accessory: { type: 'static_select', action_id: ACTIONS.missionPick, options: f.missions.slice(0, 100).map(option), ...(mission ? { initial_option: option(mission) } : {}) },
  });
  const modes: { v: SaveMode; label: string }[] = [
    ...(f.tickets.length ? [{ v: 'resolve' as const, label: 'Resolve ticket' }] : []),
    { v: 'mission', label: 'Mission only' },
    { v: 'new', label: 'New decision ticket' },
  ];
  const mode = modes.find((m) => m.v === f.mode) ?? modes[0];
  const radio = (m: (typeof modes)[number]) => ({ text: plain(m.label), value: m.v });
  blocks.push({ type: 'input', block_id: 'mode', label: plain('Save as'), element: { type: 'radio_buttons', action_id: 'value', options: modes.map(radio), initial_option: radio(mode) } });
  if (f.tickets.length) {
    const t = f.tickets.find((x) => x.id === f.ticketId);
    blocks.push({ type: 'input', block_id: 'ticket', optional: true, label: plain('Ticket to resolve'), element: { type: 'static_select', action_id: 'value', options: f.tickets.slice(0, 100).map(option), ...(t ? { initial_option: option(t) } : {}) } });
  }
  blocks.push({ type: 'input', block_id: 'decision', label: plain('Decision'), element: { type: 'plain_text_input', action_id: 'value', multiline: true, max_length: 3000, ...(f.decision ? { initial_value: clip(f.decision, 3000) } : {}) } });
  blocks.push({ type: 'input', block_id: 'summary', optional: true, label: plain('Summary'), element: { type: 'plain_text_input', action_id: 'value', multiline: true, max_length: 3000, ...(f.summary ? { initial_value: clip(f.summary, 3000) } : {}) } });
  const th = f.thread;
  const facts = [
    th && [th.channel ? `#${escape(th.channel)}` : undefined, th.count ? `${th.count} msg${th.count === 1 ? '' : 's'}` : undefined, th.participants.length ? th.participants.map((p) => `@${escape(p)}`).join(' ') : undefined, th.permalink ? `<${th.permalink}|thread>` : undefined].filter(Boolean).join(' · '),
    f.postsTo && `Posts to ${escape(f.postsTo)}`,
  ].filter(Boolean) as string[];
  if (facts.length) blocks.push({ type: 'context', elements: facts.map(md) });
  return { type: 'modal', callback_id: VIEWS.decision, private_metadata: meta, title: plain('Save as decision'), submit: plain('Save'), close: plain('Cancel'), blocks };
}

/* ---------- App Home ---------- */

export function homeView(o: { claimed: boolean; owner?: string; you: boolean; url?: string; command: string }) {
  const runs = { type: 'context', elements: [md(`Runs while ${BRAND.name} is open on your computer.`)] };
  if (!o.claimed)
    return {
      type: 'home',
      blocks: [
        { type: 'section', text: md(`*${BRAND.assistant.name}* is almost connected. Click below if you are setting up ${BRAND.name} on this workspace.`) },
        { type: 'actions', elements: [{ type: 'button', action_id: ACTIONS.claim, style: 'primary', text: plain('This is me') }] },
        runs,
      ],
    };
  return {
    type: 'home',
    blocks: [
      { type: 'section', text: md(o.you ? `Connected. Decisions and questions reach you here.` : `Connected to ${BRAND.name} for <@${o.owner}>.`) },
      { type: 'section', text: md(`\`${o.command} decide\`, \`${o.command} status\`, \`${o.command} inbox\`, and *Save as decision* on any message.`) },
      ...(o.url ? [{ type: 'actions', elements: openButton(o.url) }] : []),
      runs,
    ],
  };
}

export const helpText = (command: string) =>
  [
    `*${command} decide [text]*  record a decision (or use *Save as decision* on a message)`,
    `*${command} status [mission]*  mission briefing`,
    `*${command} inbox*  questions waiting on you`,
    `*${command} help*  this list`,
  ].join('\n');

export { clip, md, plain, quote };
