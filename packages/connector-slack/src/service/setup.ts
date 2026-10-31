import { BRAND } from '@miloops-hq/core';
import { SlackApiError } from '../api';
import { BOT_SCOPES, appIdFromToken, tokenKind } from '../manifest';
import { probeSocket } from '../socket';
import type { SlackTokenResult } from '../types';
import { ownerByEmail } from './owner';
import { statusOf } from './setupStatus';
import type { SlackContext } from './slackContext';

/**
 * Tokens from $MILOOPS_SLACK_APP_TOKEN / $MILOOPS_SLACK_BOT_TOKEN are verified like pasted ones
 * on first start, but stay in the environment: nothing is written to the credential store.
 */
export async function adoptEnvTokens(ctx: SlackContext) {
  const t = ctx.store.tokens();
  if (!t.app || !t.bot || (t.app.source === 'stored' && t.bot.source === 'stored')) return;
  for (const token of [t.app.token, t.bot.token]) {
    const r = await verifyToken(ctx, token, false);
    if (!r.ok) {
      ctx.state = 'auth-error';
      ctx.error = r.error;
      return;
    }
  }
}

export async function verifyToken(ctx: SlackContext, token: string, save: boolean): Promise<SlackTokenResult> {
  const fail = (error: string, code: string, kind?: 'app' | 'bot'): SlackTokenResult => ({
    ok: false,
    error,
    code,
    kind,
    status: statusOf(ctx),
  });
  const kind = tokenKind(token);
  if (kind === 'user')
    return fail('That is a user token (xoxp-). Paste the Bot User OAuth Token (xoxb-) from Install App.', 'user_token');
  if (kind === 'config')
    return fail(
      'That is a configuration token. Paste the app-level token (xapp-) or the bot token (xoxb-).',
      'config_token',
    );
  if (kind === 'unknown')
    return fail('Not a Slack token. App-level tokens start with xapp-, bot tokens with xoxb-.', 'unknown_token');
  if (kind === 'app') {
    let url: string;
    try {
      url = (await ctx.api(token).call<{ url: string }>('apps.connections.open')).url;
    } catch (e) {
      const code = e instanceof SlackApiError ? e.code : 'error';
      if (code === 'offline') return fail('Slack is unreachable. Check your connection and paste again.', code, 'app');
      if (code === 'missing_scope')
        return fail(
          'This token is missing connections:write. Generate it again with the connections:write scope.',
          code,
          'app',
        );
      if (code === 'not_allowed_token_type')
        return fail(
          'That is not an app-level token. Generate one under Basic Information → App-Level Tokens.',
          code,
          'app',
        );
      return fail('Slack rejected that token. Generate a new app-level token and copy it again.', code, 'app');
    }
    if (!ctx.WS) return fail('Slack needs Node.js 22 or newer.', 'unsupported', 'app');
    let hello: { appId?: string };
    try {
      hello = await probeSocket(url, ctx.WS);
    } catch {
      return fail(
        'Socket Mode is off. Turn it on under Socket Mode in the app settings, then paste again.',
        'socket_mode_off',
        'app',
      );
    }
    const appId = appIdFromToken(token) ?? hello.appId;
    const prev = ctx.store.read();
    if (prev.appId && appId && prev.appId !== appId) {
      // A different app: its bot token, workspace and owner no longer apply.
      ctx.stop();
      if (save) ctx.store.saveToken('bot', '');
      ctx.store.update({ workspace: undefined, bot: undefined, owners: [], enabled: false });
    }
    if (save) ctx.store.saveToken('app', token);
    ctx.store.update({ appId, created: true });
  } else {
    const api = ctx.api(token);
    let who: { team_id: string; team: string; url: string; user_id: string; user: string; bot_id?: string };
    try {
      who = await api.call('auth.test');
    } catch (e) {
      const code = e instanceof SlackApiError ? e.code : 'error';
      if (code === 'offline') return fail('Slack is unreachable. Check your connection and paste again.', code, 'bot');
      return fail('Slack rejected that token. Copy the Bot User OAuth Token from Install App again.', code, 'bot');
    }
    const missing = api.scopes ? BOT_SCOPES.filter((s) => !api.scopes!.includes(s)) : [];
    if (missing.length)
      return fail(
        `The app is missing ${missing.join(', ')}. Reinstall it from Install App, then paste the new token.`,
        'missing_scope',
        'bot',
      );
    const appId = ctx.store.read().appId;
    if (appId && who.bot_id) {
      const info = await api
        .call<{ bot?: { app_id?: string } }>('bots.info', { bot: who.bot_id })
        .catch(() => undefined);
      if (info?.bot?.app_id && info.bot.app_id !== appId)
        return fail(
          `That bot token belongs to another Slack app (${info.bot.app_id}). Paste the token from ${BRAND.assistant.name}'s Install App page.`,
          'wrong_app',
          'bot',
        );
    }
    if (save) ctx.store.saveToken('bot', token);
    ctx.store.update({
      workspace: { id: who.team_id, name: who.team, url: who.url },
      bot: { userId: who.user_id, name: who.user },
    });
    if (!ctx.store.read().owners.length && api.scopes?.includes('users:read.email')) await ownerByEmail(ctx, api);
  }
  const t = ctx.store.tokens();
  if (t.app && t.bot) {
    ctx.stop();
    ctx.store.update({ enabled: true });
    ctx.start();
  }
  return { ok: true, kind, status: statusOf(ctx) };
}
