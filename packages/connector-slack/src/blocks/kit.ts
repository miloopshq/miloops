import { BRAND } from '@miloops-hq/core';

export type Block = Record<string, unknown>;

export const plain = (text: string, emoji = true) => ({ type: 'plain_text', text, emoji });
export const md = (text: string) => ({ type: 'mrkdwn', text });
export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const quote = (s: string) =>
  escape(s)
    .split('\n')
    .map((l) => `>${l}`)
    .join('\n');

export const ACTIONS = {
  claim: 'claim_owner',
  option: 'ask_option',
  reply: 'ask_reply',
  open: 'open_miloops',
  missionPick: 'mission_pick',
  approve: 'verify_approve',
  rework: 'verify_rework',
} as const;

export const VIEWS = { decision: 'decision_modal', reply: 'ask_reply_modal', rework: 'verify_rework_modal' } as const;

export const openButton = (url: string | undefined): Block[] =>
  url ? [{ type: 'button', action_id: ACTIONS.open, text: plain(`Open in ${BRAND.name}`), url }] : [];
