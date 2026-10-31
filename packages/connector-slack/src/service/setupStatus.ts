import { slackLinks } from '../manifest';
import type { SlackStatus } from '../types';
import type { SlackContext } from './slackContext';

export function statusOf(ctx: SlackContext): SlackStatus {
  const c = ctx.store.read();
  const t = ctx.store.tokens();
  const step: SlackStatus['step'] = !t.app ? (c.created ? 2 : 1) : !t.bot ? 4 : !c.owners.length ? 5 : 'done';
  return {
    state: ctx.state,
    error: ctx.error,
    enabled: c.enabled,
    step,
    setup: {
      created: c.created || !!t.app,
      appId: c.appId,
      appToken: t.app?.source ?? null,
      botToken: t.bot?.source ?? null,
    },
    workspace: c.workspace,
    bot: c.bot,
    owners: c.owners,
    allow: c.allow,
    notify: c.notify,
    summary: c.summary,
    command: c.command,
    links: {
      create: slackLinks.create(c.command),
      ...(c.appId ? { app: slackLinks.app(c.appId), install: slackLinks.install(c.appId) } : {}),
      ...(c.appId && c.workspace
        ? { home: slackLinks.home(c.workspace.id, c.appId), homeWeb: slackLinks.homeWeb(c.workspace.id, c.appId) }
        : {}),
    },
    ...(ctx.heldBy ? { heldBy: ctx.heldBy } : {}),
  };
}
