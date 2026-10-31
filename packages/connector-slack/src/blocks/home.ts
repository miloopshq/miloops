import { BRAND } from '@miloops-hq/core';
import { ACTIONS, md, openButton, plain } from './kit';

export function homeView(o: { claimed: boolean; owner?: string; you: boolean; url?: string; command: string }) {
  const runs = { type: 'context', elements: [md(`Runs while ${BRAND.name} is open on your computer.`)] };
  if (!o.claimed)
    return {
      type: 'home',
      blocks: [
        {
          type: 'section',
          text: md(
            `*${BRAND.assistant.name}* is almost connected. Click below if you are setting up ${BRAND.name} on this workspace.`,
          ),
        },
        {
          type: 'actions',
          elements: [{ type: 'button', action_id: ACTIONS.claim, style: 'primary', text: plain('This is me') }],
        },
        runs,
      ],
    };
  return {
    type: 'home',
    blocks: [
      {
        type: 'section',
        text: md(
          o.you
            ? `Connected. Decisions and questions reach you here.`
            : `Connected to ${BRAND.name} for <@${o.owner}>.`,
        ),
      },
      {
        type: 'section',
        text: md(
          `\`${o.command} decide\`, \`${o.command} status\`, \`${o.command} inbox\`, and *Save as decision* on any message.`,
        ),
      },
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
