import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  BRAND,
  deriveStates,
  firstSentence,
  recordDecision,
  resolve,
  type AgentSessionDoc,
  type DecisionSource,
  type MapSnapshot,
  type PendingQuestion,
  type Ticket,
  type TrackerAdapter,
} from '@miloops-hq/core';
import { AnswerError, readAgentDocs, writeAgentAnswer } from '@miloops-hq/core/bridge';
import { SlackApi, SlackApiError, postResponse } from './api';
import {
  ACTIONS,
  VIEWS,
  askClosedMessage,
  askMessage,
  clip,
  decisionModal,
  escape,
  helpText,
  homeView,
  loadingModal,
  md,
  noticeModal,
  replyModal,
  type AskRef,
  type AskView,
  type DecisionForm,
  type SaveMode,
} from './blocks';
import { BOT_SCOPES, SAVE_DECISION_CALLBACK, appIdFromToken, slackLinks, tokenKind } from './manifest';
import { SocketMode, probeSocket, type Envelope, type EnvelopeResult, type WebSocketCtor } from './socket';
import { briefMission, formatTokens, missionListBlocks, statusBlocks } from './status';
import { askStore, slackLock, slackStore, type AskRecord, type SlackConfig } from './store';
import { deterministicSummary, plainText, type ThreadMessage } from './summary';
import {
  SLACK_NOTIFY_EVENTS,
  type SlackSettingsPatch,
  type SlackState,
  type SlackStatus,
  type SlackTokenResult,
  type SlackUser,
} from './types';

type Env = Record<string, string | undefined>;
type Payload = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface SlackServiceOptions {
  /** Tracker folder; agent questions are read from `<root>/.agents`. */
  root: string;
  active: () => Promise<TrackerAdapter>;
  /** Command center URL for "Open in MILOOPS" buttons. */
  url: () => string | undefined;
  configDir: string;
  env?: Env;
  fetch?: typeof fetch;
  WebSocket?: WebSocketCtor;
  /** Slack Web API base; defaults to $MILOOPS_SLACK_API, else https://slack.com/api. */
  apiUrl?: string;
  /** How often to look for new agent questions and mission changes; 0 = only on `tick()` (tests). */
  pollMs?: number;
  /** Mission changes are checked every n-th tick. */
  missionEvery?: number;
  /** At most one notification message per mission per window. */
  batchMs?: number;
  backoffMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
  /** Lock owner id; distinct per service so tests can run several in one process. */
  lockOwner?: string;
  /** The local user's email, matched against the workspace to skip the Home-tab claim. Defaults to `git config user.email`. */
  ownerEmail?: () => string | undefined;
}

function gitEmail(cwd: string) {
  try {
    return execFileSync('git', ['config', '--get', 'user.email'], {
      cwd: existsSync(cwd) ? cwd : undefined,
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return undefined;
  }
}

const AUTH_CODES = new Set([
  'invalid_auth',
  'not_authed',
  'account_inactive',
  'token_revoked',
  'token_expired',
  'no_permission',
]);
const REFUSED = `Only the ${BRAND.name} owner and allowed users can do that. Ask the owner to add you in ${BRAND.name} Settings → Slack.`;
const ALREADY = `Already answered in ${BRAND.name}.`;
const DECISION_TYPES = new Set<Ticket['type']>(['grilling', 'prototype']);
const isDecisionTicket = (t: Ticket) =>
  t.state === 'open' && (DECISION_TYPES.has(t.type) || (t.type === 'task' && !!t.hitl));
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/** What the decision modal carries between open, mission change and submit. Thread text is never stored here. */
interface DecisionMeta {
  /** channel id / name */
  c: string;
  cn?: string;
  /** thread root ts and clicked message ts (shortcut only) */
  t?: string;
  m?: string;
  /** submitting user, workspace */
  u: string;
  w: string;
  /** response_url (slash command) */
  r?: string;
  /** permalink, participants [id, name] */
  l?: string;
  p?: [string, string][];
  /** current mission */
  mid?: string;
}

interface MissionNotes {
  known: Set<string>;
  blocked: Set<string>;
  closed: Set<string>;
  done: boolean;
}

interface Batch {
  lines: string[];
  lastAt: number;
  root?: { day: string; ts: string };
}

export class SlackService {
  private store;
  private lock;
  private asks;
  private env: Env;
  private apiUrl?: string;
  private WS?: WebSocketCtor;
  private socket?: SocketMode;
  private state: SlackState = 'off';
  private error?: string;
  private heldBy?: string;
  private bot?: SlackApi;
  private dms = new Map<string, string>();
  private names = new Map<string, string>();
  private answering = new Set<string>();
  private missions = new Map<string, MissionNotes>();
  private batches = new Map<string, Batch>();
  private ticks = 0;
  private ticking?: Promise<void>;
  private poll?: ReturnType<typeof setInterval>;

  constructor(private o: SlackServiceOptions) {
    this.env = o.env ?? process.env;
    this.store = slackStore(o.configDir, this.env);
    this.lock = slackLock(o.configDir, o.lockOwner ?? `${process.pid}:${o.root}`);
    this.asks = askStore(o.root);
    this.apiUrl = o.apiUrl ?? this.env[`${BRAND.slug.toUpperCase()}_SLACK_API`];
    this.WS = o.WebSocket ?? (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
    const c = this.store.read();
    if (c.enabled) this.start();
    else if (!c.workspace) void this.adoptEnvTokens();
    if (o.pollMs) {
      this.poll = setInterval(() => void this.tick(), o.pollMs);
      this.poll.unref?.();
    }
  }

  private api(token: string) {
    return new SlackApi({ token, apiUrl: this.apiUrl, fetch: this.o.fetch, sleep: this.o.sleep });
  }

  /** Resolves once acks, follow-up work and the poll in flight are done. */
  async idle() {
    await this.socket?.idle();
    await this.ticking;
  }

  /* ---------------- settings and setup ---------------- */

  status(): SlackStatus {
    const c = this.store.read();
    const t = this.store.tokens();
    const step: SlackStatus['step'] = !t.app ? (c.created ? 2 : 1) : !t.bot ? 4 : !c.owners.length ? 5 : 'done';
    return {
      state: this.state,
      error: this.error,
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
      ...(this.heldBy ? { heldBy: this.heldBy } : {}),
    };
  }

  markCreated() {
    this.store.update({ created: true });
    return this.status();
  }

  /** Step 3 or 4: routes a pasted token by prefix and verifies it live before saving. */
  pasteToken(raw: string): Promise<SlackTokenResult> {
    return this.verifyToken(raw.trim(), true);
  }

  /**
   * Tokens from $MILOOPS_SLACK_APP_TOKEN / $MILOOPS_SLACK_BOT_TOKEN are verified like pasted ones
   * on first start, but stay in the environment: nothing is written to the credential store.
   */
  private async adoptEnvTokens() {
    const t = this.store.tokens();
    if (!t.app || !t.bot || (t.app.source === 'stored' && t.bot.source === 'stored')) return;
    for (const token of [t.app.token, t.bot.token]) {
      const r = await this.verifyToken(token, false);
      if (!r.ok) {
        this.state = 'auth-error';
        this.error = r.error;
        return;
      }
    }
  }

  private async verifyToken(token: string, save: boolean): Promise<SlackTokenResult> {
    const fail = (error: string, code: string, kind?: 'app' | 'bot'): SlackTokenResult => ({
      ok: false,
      error,
      code,
      kind,
      status: this.status(),
    });
    const kind = tokenKind(token);
    if (kind === 'user')
      return fail(
        'That is a user token (xoxp-). Paste the Bot User OAuth Token (xoxb-) from Install App.',
        'user_token',
      );
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
        url = (await this.api(token).call<{ url: string }>('apps.connections.open')).url;
      } catch (e) {
        const code = e instanceof SlackApiError ? e.code : 'error';
        if (code === 'offline')
          return fail('Slack is unreachable. Check your connection and paste again.', code, 'app');
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
      if (!this.WS) return fail('Slack needs Node.js 22 or newer.', 'unsupported', 'app');
      let hello: { appId?: string };
      try {
        hello = await probeSocket(url, this.WS);
      } catch {
        return fail(
          'Socket Mode is off. Turn it on under Socket Mode in the app settings, then paste again.',
          'socket_mode_off',
          'app',
        );
      }
      const appId = appIdFromToken(token) ?? hello.appId;
      const prev = this.store.read();
      if (prev.appId && appId && prev.appId !== appId) {
        // A different app: its bot token, workspace and owner no longer apply.
        this.stop();
        if (save) this.store.saveToken('bot', '');
        this.store.update({ workspace: undefined, bot: undefined, owners: [], enabled: false });
      }
      if (save) this.store.saveToken('app', token);
      this.store.update({ appId, created: true });
    } else {
      const api = this.api(token);
      let who: { team_id: string; team: string; url: string; user_id: string; user: string; bot_id?: string };
      try {
        who = await api.call('auth.test');
      } catch (e) {
        const code = e instanceof SlackApiError ? e.code : 'error';
        if (code === 'offline')
          return fail('Slack is unreachable. Check your connection and paste again.', code, 'bot');
        return fail('Slack rejected that token. Copy the Bot User OAuth Token from Install App again.', code, 'bot');
      }
      const missing = api.scopes ? BOT_SCOPES.filter((s) => !api.scopes!.includes(s)) : [];
      if (missing.length)
        return fail(
          `The app is missing ${missing.join(', ')}. Reinstall it from Install App, then paste the new token.`,
          'missing_scope',
          'bot',
        );
      const appId = this.store.read().appId;
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
      if (save) this.store.saveToken('bot', token);
      this.store.update({
        workspace: { id: who.team_id, name: who.team, url: who.url },
        bot: { userId: who.user_id, name: who.user },
      });
      if (!this.store.read().owners.length && api.scopes?.includes('users:read.email')) await this.ownerByEmail(api);
    }
    const t = this.store.tokens();
    if (t.app && t.bot) {
      this.stop();
      this.store.update({ enabled: true });
      this.start();
    }
    return { ok: true, kind, status: this.status() };
  }

  updateSettings(patch: SlackSettingsPatch) {
    const c = this.store.read();
    const next: Partial<SlackConfig> = {};
    if (patch.allow)
      next.allow = patch.allow.filter((u) => /^[UW][A-Z0-9]+$/.test(u.id)).map((u) => ({ id: u.id, name: u.name }));
    if (patch.notify) {
      const n = { ...c.notify, ...patch.notify };
      if (n.target !== 'dm' && !/^[CG][A-Z0-9]+$/.test(n.target)) n.target = c.notify.target;
      n.events = n.events.filter((e) => SLACK_NOTIFY_EVENTS.includes(e));
      if (n.detail !== 'titles-only') n.detail = 'full';
      next.notify = n;
    }
    if (patch.summary) next.summary = patch.summary;
    if (patch.enabled !== undefined) next.enabled = patch.enabled;
    this.store.update(next);
    if (patch.enabled === true) this.start();
    if (patch.enabled === false) this.stop();
    return this.status();
  }

  resetOwner() {
    this.store.update({ owners: [] });
    return this.status();
  }

  remove() {
    this.stop();
    this.store.clear();
    this.dms.clear();
    this.state = 'off';
    this.error = undefined;
    return this.status();
  }

  /** Workspace members for the allowlist picker. */
  async members(): Promise<SlackUser[]> {
    if (!this.bot) return [];
    const r = await this.call<{ members: Payload[] }>('users.list', { limit: 200 });
    return r.members
      .filter((m) => !m.deleted && !m.is_bot && m.id !== 'USLACKBOT')
      .map((m) => ({ id: m.id as string, name: (m.profile?.display_name || m.real_name || m.name) as string }));
  }

  /* ---------------- connection ---------------- */

  start() {
    if (this.socket) return;
    const t = this.store.tokens();
    if (!t.app || !t.bot) {
      this.state = 'off';
      return;
    }
    if (!this.WS) {
      this.state = 'unsupported';
      this.error = 'Slack needs Node.js 22 or newer';
      return;
    }
    const held = this.lock.acquire(this.o.root);
    if (!held.ok) {
      this.state = 'elsewhere';
      this.heldBy = held.heldBy;
      return;
    }
    this.heldBy = undefined;
    this.error = undefined;
    this.bot = this.api(t.bot.token);
    const app = this.api(t.app.token);
    this.socket = new SocketMode({
      open: async () => (await app.call<{ url: string }>('apps.connections.open')).url,
      WebSocket: this.WS,
      onEnvelope: (e) => this.onEnvelope(e),
      onState: (s, err) => {
        this.state = s;
        this.error = err;
        if (s === 'auth-error') this.authFailed(err);
      },
      fatal: (e) =>
        e instanceof SlackApiError && (AUTH_CODES.has(e.code) || e.code === 'not_allowed_token_type')
          ? 'Slack rejected the app-level token; reconnect in Settings'
          : undefined,
      backoffMs: this.o.backoffMs,
    });
    this.socket.start();
  }

  stop() {
    this.socket?.stop();
    this.socket = undefined;
    this.bot = undefined;
    this.lock.release();
    if (this.state !== 'auth-error') this.state = 'off';
  }

  private authFailed(error = 'Slack rejected the bot token; reconnect in Settings') {
    this.store.update({ enabled: false });
    this.stop();
    this.state = 'auth-error';
    this.error = error;
  }

  close() {
    clearInterval(this.poll);
    this.stop();
  }

  private async call<T = Payload>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!this.bot) throw new SlackApiError('not_connected', method);
    try {
      return await this.bot.call<T>(method, args);
    } catch (e) {
      if (e instanceof SlackApiError && AUTH_CODES.has(e.code)) this.authFailed();
      throw e;
    }
  }

  private allowed(user: string) {
    const c = this.store.read();
    return c.owners.some((o) => o.id === user) || c.allow.some((o) => o.id === user);
  }

  private async nameOf(user: string) {
    if (!this.names.has(user)) {
      const r = await this.call<{ user: Payload }>('users.info', { user }).catch(() => undefined);
      const u = r?.user;
      this.names.set(user, (u?.profile?.display_name || u?.real_name || u?.name || user) as string);
    }
    return this.names.get(user)!;
  }

  private async dmOf(user: string) {
    if (!this.dms.has(user))
      this.dms.set(
        user,
        (await this.call<{ channel: { id: string } }>('conversations.open', { users: user })).channel.id,
      );
    return this.dms.get(user)!;
  }

  /** Where notifications and asks go: the owner's DM by default, or the opted-in channel. */
  private async target(): Promise<string | undefined> {
    const c = this.store.read();
    if (c.notify.target !== 'dm') return c.notify.target;
    return c.owners[0] ? this.dmOf(c.owners[0].id) : undefined;
  }

  /* ---------------- envelopes ---------------- */

  async onEnvelope(e: Envelope): Promise<EnvelopeResult | void> {
    const p = e.payload as Payload;
    if (e.type === 'events_api') {
      const ev = p.event as Payload | undefined;
      if (ev?.type === 'app_home_opened') return { after: () => this.publishHome(ev.user) };
      return;
    }
    if (e.type === 'slash_commands') return this.onCommand(p);
    if (p.type === 'message_action') return this.onShortcut(p);
    if (p.type === 'block_actions') return this.onAction(p);
    if (p.type === 'view_submission') return this.onSubmit(p);
  }

  private async publishHome(user: string) {
    const c = this.store.read();
    await this.call('views.publish', {
      user_id: user,
      view: homeView({
        claimed: !!c.owners.length,
        owner: c.owners[0]?.id,
        you: c.owners.some((o) => o.id === user),
        url: this.o.url(),
        command: c.command,
      }),
    });
  }

  /**
   * Step 5 without leaving MILOOPS: the person running `miloops` is the owner, so when their git
   * email belongs to exactly one workspace member, that member is claimed and DM'd right away.
   * Anything else (no email, no match, missing scope) falls back to "This is me" on the Home tab.
   */
  private async ownerByEmail(api: SlackApi) {
    const email = (this.o.ownerEmail ?? (() => gitEmail(this.o.root)))()?.trim();
    if (!email) return;
    const r = await api
      .call<{
        user?: {
          id: string;
          deleted?: boolean;
          is_bot?: boolean;
          name?: string;
          real_name?: string;
          profile?: { display_name?: string };
        };
      }>('users.lookupByEmail', { email })
      .catch(() => undefined);
    const u = r?.user;
    if (!u || u.deleted || u.is_bot) return;
    this.store.update({
      owners: [{ id: u.id, name: u.profile?.display_name || u.name || u.real_name, via: 'git-email' }],
    });
    await api
      .call<{ channel: { id: string } }>('conversations.open', { users: u.id })
      .then((o) =>
        api.call('chat.postMessage', {
          channel: o.channel.id,
          text: 'Connected. Decisions and questions will reach you here.',
        }),
      )
      .catch(() => undefined);
  }

  /** Step 5: the first person to click "This is me" on the Home tab becomes the owner; MILO confirms in their DM. */
  private async claim(user: string) {
    if (this.store.read().owners.length) return this.publishHome(user);
    this.store.update({ owners: [{ id: user, name: await this.nameOf(user), via: 'home' }] });
    await this.call('chat.postMessage', {
      channel: await this.dmOf(user),
      text: 'Connected. Decisions and questions will reach you here.',
    });
    await this.publishHome(user);
  }

  private onCommand(p: Payload): EnvelopeResult {
    const command = p.command as string;
    const [sub = '', ...rest] = String(p.text ?? '')
      .trim()
      .split(/\s+/);
    const arg = rest.join(' ').trim();
    const reply = (text: string) => ({ ack: { response_type: 'ephemeral', text } });
    if (!sub || sub === 'help') return reply(helpText(command));
    if (!this.allowed(p.user_id)) return reply(REFUSED);
    if (sub === 'decide') {
      const meta: DecisionMeta = { c: p.channel_id, cn: p.channel_name, u: p.user_id, w: p.team_id, r: p.response_url };
      return { after: () => this.openDecision(p.trigger_id, meta, arg) };
    }
    if (sub === 'status')
      return {
        after: async () =>
          postResponse(
            p.response_url,
            { response_type: 'ephemeral', ...(await this.statusMessage(arg, command)) },
            this.o.fetch,
          ),
      };
    if (sub === 'inbox')
      return {
        after: async () =>
          postResponse(p.response_url, { response_type: 'ephemeral', ...(await this.inboxMessage()) }, this.o.fetch),
      };
    return reply(`Unknown command \`${sub}\`.\n${helpText(command)}`);
  }

  private onShortcut(p: Payload): EnvelopeResult | void {
    if (p.callback_id !== SAVE_DECISION_CALLBACK) return;
    if (!this.allowed(p.user.id))
      return { after: () => postResponse(p.response_url, { response_type: 'ephemeral', text: REFUSED }, this.o.fetch) };
    const msg = p.message as Payload;
    const meta: DecisionMeta = {
      c: p.channel.id,
      cn: p.channel.name,
      t: msg.thread_ts ?? msg.ts,
      m: msg.ts,
      u: p.user.id,
      w: p.team.id,
    };
    return { after: () => this.openDecision(p.trigger_id, meta, plainText(String(msg.text ?? ''))) };
  }

  private onAction(p: Payload): EnvelopeResult | void {
    const a = (p.actions as Payload[])[0];
    const id = String(a?.action_id ?? '');
    const user = p.user.id as string;
    if (id === ACTIONS.claim) return { after: () => this.claim(user) };
    if (id === ACTIONS.missionPick && p.view)
      return { after: () => this.changeMission(p.view, a.selected_option.value) };
    if (id !== ACTIONS.reply && !id.startsWith(`${ACTIONS.option}:`)) return;
    const ephemeral = (text: string) =>
      postResponse(p.response_url, { response_type: 'ephemeral', replace_original: false, text }, this.o.fetch);
    if (!this.allowed(user)) return { after: () => ephemeral(REFUSED) };
    const ref = JSON.parse(a.value) as AskRef;
    return {
      after: async () => {
        const found = await this.pending(ref);
        if (!found) return ephemeral(ALREADY);
        if (id === ACTIONS.reply) {
          await this.call('views.open', {
            trigger_id: p.trigger_id,
            view: replyModal(found.view, JSON.stringify({ s: ref.s, q: ref.q })),
          });
          return;
        }
        const text = found.q.suggestions?.[ref.i ?? -1];
        if (text === undefined) return ephemeral(ALREADY);
        if (!(await this.answer(ref, text, user))) await ephemeral(ALREADY);
      },
    };
  }

  private onSubmit(p: Payload): EnvelopeResult | void {
    const view = p.view as Payload;
    const values = (view.state?.values ?? {}) as Record<string, Record<string, Payload>>;
    const user = p.user.id as string;
    if (view.callback_id === VIEWS.reply) {
      const ref = JSON.parse(view.private_metadata) as AskRef;
      const text = String(values.answer?.value?.value ?? '').trim();
      if (!text) return { ack: { response_action: 'errors', errors: { answer: 'Enter an answer' } } };
      if (!this.allowed(user)) return { ack: { response_action: 'errors', errors: { answer: REFUSED } } };
      const ok = this.writeAnswer(ref, text, user);
      if (!ok) return { ack: { response_action: 'errors', errors: { answer: ALREADY } } };
      return { after: () => this.closeAsk(ref.q) };
    }
    if (view.callback_id !== VIEWS.decision) return;
    const meta = JSON.parse(view.private_metadata) as DecisionMeta;
    const decision = String(values.decision?.value?.value ?? '').trim();
    if (!decision) return { ack: { response_action: 'errors', errors: { decision: 'Enter the decision' } } };
    if (!this.allowed(user)) return { ack: { response_action: 'errors', errors: { decision: REFUSED } } };
    const mode = (values.mode?.value?.selected_option?.value ?? 'mission') as SaveMode;
    const ticketId = values.ticket?.value?.selected_option?.value as string | undefined;
    if (mode === 'resolve' && !ticketId)
      return { ack: { response_action: 'errors', errors: { ticket: 'Pick the ticket to resolve' } } };
    const mapId = meta.mid ?? (values.mission?.[ACTIONS.missionPick]?.selected_option?.value as string | undefined);
    if (!mapId) return { ack: { response_action: 'errors', errors: { decision: 'Pick a mission' } } };
    const summary = String(values.summary?.value?.value ?? '').trim();
    return { after: () => this.saveDecision({ meta, user, mapId, mode, ticketId, decision, summary }) };
  }

  /* ---------------- decisions ---------------- */

  private async openDecision(trigger: string, meta: DecisionMeta, prefill: string) {
    const opened = await this.call<{ view: { id: string } }>('views.open', {
      trigger_id: trigger,
      view: loadingModal(JSON.stringify(meta)),
    });
    const viewId = opened.view.id;
    const adapter = await this.o.active();
    const maps = await adapter.listMaps();
    if (!maps.length) {
      await this.call('views.update', {
        view_id: viewId,
        view: noticeModal(JSON.stringify(meta), `No missions yet. Start one in ${BRAND.name}, then save this again.`),
      });
      return;
    }
    let messages: ThreadMessage[] = [];
    if (meta.t) {
      let replies: { messages: Payload[] };
      try {
        replies = await this.call('conversations.replies', { channel: meta.c, ts: meta.t, limit: 200 });
      } catch (e) {
        const code = e instanceof SlackApiError ? e.code : '';
        const text =
          code === 'not_in_channel' || code === 'channel_not_found'
            ? `Invite @${BRAND.assistant.name} to ${meta.cn ? `#${escape(meta.cn)}` : 'this conversation'} to save threads here: \`/invite @${BRAND.assistant.name}\``
            : `Couldn't read the thread (${escape(code || 'error')}).`;
        await this.call('views.update', { view_id: viewId, view: noticeModal(JSON.stringify(meta), text) });
        return;
      }
      const human = replies.messages.filter((m) => m.user && !m.bot_id).slice(0, 200);
      const ids = [...new Set(human.map((m) => m.user as string))];
      const names = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await this.nameOf(id)] as const)));
      messages = human.map((m) => ({
        ts: m.ts,
        user: m.user,
        name: names[m.user],
        text: plainText(String(m.text ?? ''), names),
      }));
      meta.p = ids.slice(0, 15).map((id) => [id, clip(names[id], 40)]);
      meta.l = (
        await this.call<{ permalink: string }>('chat.getPermalink', { channel: meta.c, message_ts: meta.m ?? meta.t })
      ).permalink;
    } else {
      const ws = this.store.read().workspace;
      if (ws) meta.l = `${ws.url.replace(/\/$/, '')}/archives/${meta.c}`;
    }
    const summary = deterministicSummary(messages, meta.m);
    const asks = this.asks.read();
    const inThread = meta.t ? Object.values(asks).find((a) => a.channel === meta.c && a.ts === meta.t) : undefined;
    meta.mid = [inThread?.view?.mapId, this.store.read().channelMission[meta.c], maps[0].id].find(
      (id) => id && maps.some((m) => m.id === id),
    )!;
    const form = await this.form(adapter, maps, meta.mid, {
      decision: prefill,
      summary,
      related: inThread?.view?.ticketId,
      count: messages.length,
      meta,
    });
    await this.call('views.update', { view_id: viewId, view: decisionModal(form, JSON.stringify(meta)) });
  }

  private async form(
    adapter: TrackerAdapter,
    maps: { id: string; key: string; title: string }[],
    mapId: string,
    o: { decision: string; summary: string; related?: string; count: number; meta: DecisionMeta },
  ): Promise<DecisionForm> {
    const snap = await adapter.loadMap(mapId);
    const docs = await readAgentDocs(this.o.root);
    const related = this.relatedTicket(snap, docs, o.related);
    const tickets = snap.tickets.filter((t) => isDecisionTicket(t) || t.id === related?.id);
    return {
      missions: maps.map((m) => ({ id: m.id, label: `${m.key} ${m.title}` })),
      mapId,
      tickets: tickets.map((t) => ({ id: t.id, label: `${t.key} ${t.title}` })),
      ticketId: related?.id,
      mode: related ? 'resolve' : 'new',
      decision: o.decision,
      summary: o.summary,
      thread: o.meta.t
        ? { channel: o.meta.cn, count: o.count, participants: (o.meta.p ?? []).map(([, n]) => n), permalink: o.meta.l }
        : undefined,
      postsTo: `${adapter.label} · mission ${snap.map.key}${related ? ` · ${related.key}` : ''}`,
    };
  }

  /** The ticket a Slack decision resolves by default; first match wins (see the plan, §3). */
  private relatedTicket(snap: MapSnapshot, docs: AgentSessionDoc[], askTicket?: string): Ticket | undefined {
    const open = snap.tickets.filter((t) => t.state === 'open');
    const byId = (id?: string) => open.find((t) => t.id === id);
    if (byId(askTicket)) return byId(askTicket);
    const waiting = [
      ...new Set(
        docs
          .flatMap((d) => d.pending)
          .filter((q) => q.mapId === snap.map.id && q.ticketId)
          .map((q) => q.ticketId!),
      ),
    ].filter((id) => byId(id));
    if (waiting.length === 1) return byId(waiting[0]);
    return open.filter((t) => isDecisionTicket(t) && t.assignee).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }

  private async changeMission(view: Payload, mapId: string) {
    const meta = JSON.parse(view.private_metadata) as DecisionMeta;
    const values = (view.state?.values ?? {}) as Record<string, Record<string, Payload>>;
    meta.mid = mapId;
    const adapter = await this.o.active();
    const maps = await adapter.listMaps();
    const form = await this.form(adapter, maps, mapId, {
      decision: String(values.decision?.value?.value ?? ''),
      summary: String(values.summary?.value?.value ?? ''),
      count: 0,
      meta,
    });
    if (form.thread) form.thread.count = 0;
    await this.call('views.update', {
      view_id: view.id,
      hash: view.hash,
      view: decisionModal(form, JSON.stringify(meta)),
    });
  }

  private async saveDecision(s: {
    meta: DecisionMeta;
    user: string;
    mapId: string;
    mode: SaveMode;
    ticketId?: string;
    decision: string;
    summary: string;
  }) {
    const { meta } = s;
    const adapter = await this.o.active();
    const decidedBy = `slack:${s.user}`;
    const at = Date.now();
    const source: DecisionSource = {
      kind: 'slack',
      ref: `${meta.c}/${meta.m ?? `cmd-${at}`}`,
      ...(meta.l ? { url: meta.l } : {}),
      ...(meta.cn ? { label: `#${meta.cn}` } : {}),
      meta: {
        workspaceId: meta.w,
        channelId: meta.c,
        ...(meta.cn ? { channelName: meta.cn } : {}),
        ...(meta.t ? { threadTs: meta.t } : {}),
        ...(meta.m ? { messageTs: meta.m } : {}),
      },
    };
    const participants = (meta.p ?? []).map(([id, name]) => ({ id: `slack:${id}`, name }));
    if (!participants.some((p) => p.id === decidedBy))
      participants.push({ id: decidedBy, name: await this.nameOf(s.user) });
    const line = `${firstSentence(s.decision)}${meta.l ? ` ([Slack](${meta.l}), ${day(at)})` : ` (Slack, ${day(at)})`}`;
    const fields = { decidedBy, participants, source, ...(s.summary ? { rationale: s.summary } : {}) };
    let resolved: Ticket | undefined;
    let title = s.mapId;
    try {
      const snap = await adapter.loadMap(s.mapId);
      title = snap.map.title;
      if (s.mode === 'mission') {
        await recordDecision(
          adapter,
          s.mapId,
          {
            question: `Slack thread${meta.cn ? ` in #${meta.cn}` : ''}`,
            answer: s.decision,
            summary: firstSentence(s.decision),
            ...fields,
          },
          { missionLine: line },
        );
      } else {
        const ticketId =
          s.mode === 'resolve'
            ? s.ticketId!
            : (
                await adapter.createTicket(s.mapId, {
                  title: clip(firstSentence(s.decision), 80),
                  type: 'grilling',
                  body: `Recorded from Slack${meta.cn ? ` (#${meta.cn})` : ''}.${meta.l ? `\n\n${meta.l}` : ''}\n\nPart of mission ${snap.map.key}.`,
                })
              ).id;
        resolved = await resolve(adapter, s.mapId, ticketId, {
          answer: s.decision,
          author: decidedBy,
          summary: firstSentence(s.decision),
          decision: fields,
          missionLine: line,
        });
      }
    } catch (e) {
      await this.tell(meta, `Couldn't save the decision: ${(e as Error).message}`);
      return;
    }
    this.store.update({ channelMission: { ...this.store.read().channelMission, [meta.c]: s.mapId } });
    const url = this.o.url();
    const text = `Saved to *${escape(title)}*${resolved ? `, resolved ${escape(resolved.key)} ${escape(resolved.title)}` : ''}`;
    await this.tell(
      meta,
      text,
      url
        ? [
            { type: 'section', text: md(text) },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  action_id: ACTIONS.open,
                  text: { type: 'plain_text', text: `Open in ${BRAND.name}` },
                  url,
                },
              ],
            },
          ]
        : undefined,
    );
  }

  /** Confirmation: a thread reply for shortcuts, ephemeral for the slash command, the user's DM as the fallback. */
  private async tell(meta: DecisionMeta, text: string, blocks?: unknown[]) {
    if (meta.r)
      return postResponse(meta.r, { response_type: 'ephemeral', text, ...(blocks ? { blocks } : {}) }, this.o.fetch);
    try {
      await this.call('chat.postMessage', { channel: meta.c, thread_ts: meta.t, text, ...(blocks ? { blocks } : {}) });
    } catch {
      await this.call('chat.postMessage', {
        channel: await this.dmOf(meta.u),
        text,
        ...(blocks ? { blocks } : {}),
      }).catch(() => {});
    }
  }

  /* ---------------- agent asks ---------------- */

  private async askView(
    q: PendingQuestion,
    adapter?: TrackerAdapter,
  ): Promise<AskView & { mapId: string; ticketId?: string; at: number }> {
    let mission: string | undefined;
    let ticket: string | undefined;
    try {
      const snap = await (adapter ?? (await this.o.active())).loadMap(q.mapId);
      mission = snap.map.title;
      const t = snap.tickets.find((x) => x.id === q.ticketId);
      ticket = t ? `${t.key} ${t.title}` : undefined;
    } catch {
      /* mission unknown to the active tracker: show the ask without it */
    }
    return {
      sessionId: q.sessionId,
      questionId: q.id,
      text: q.text,
      suggestions: q.suggestions,
      agent: q.agent,
      mission,
      ticket,
      mapId: q.mapId,
      ticketId: q.ticketId,
      at: q.at,
    };
  }

  private async pending(ref: AskRef) {
    const docs = await readAgentDocs(this.o.root);
    const q = docs.find((d) => d.session.id === ref.s)?.pending.find((x) => x.id === ref.q);
    return q ? { q, view: await this.askView(q) } : undefined;
  }

  /** Compare-and-set: only the first answer to an open question is delivered. */
  private writeAnswer(ref: AskRef, text: string, user: string) {
    if (this.answering.has(ref.q)) return false;
    this.answering.add(ref.q);
    try {
      writeAgentAnswer(this.o.root, { sessionId: ref.s, questionId: ref.q, text, author: `slack:${user}` });
    } catch (e) {
      if (e instanceof AnswerError) return false;
      this.answering.delete(ref.q);
      throw e;
    }
    const asks = this.asks.read();
    if (asks[ref.q]) {
      asks[ref.q].by = { user, text };
      this.asks.write(asks);
    }
    return true;
  }

  private async answer(ref: AskRef, text: string, user: string) {
    if (!this.writeAnswer(ref, text, user)) return false;
    await this.closeAsk(ref.q);
    return true;
  }

  /** Replace the ask's buttons with its outcome. */
  private async closeAsk(questionId: string, docs?: AgentSessionDoc[]) {
    const asks = this.asks.read();
    const rec = asks[questionId];
    if (!rec || rec.closed || !rec.view) return;
    let line: string;
    let answered = true;
    if (rec.by)
      line = `✓ Answered by <@${rec.by.user}> via Slack: “${escape(clip(rec.by.text, 300))}”. ${escape(rec.view.agent)} resumed.`;
    else {
      const doc = (docs ?? (await readAgentDocs(this.o.root))).find((d) => d.session.id === rec.sessionId);
      const reply = doc?.chats.find((c) => c.from === 'human' && c.at >= rec.view!.at);
      answered = !!reply;
      line = reply
        ? `✓ Answered in ${BRAND.name} by ${escape(reply.author)}: “${escape(clip(reply.text, 300))}”.`
        : `No longer waiting: ${escape(rec.view.agent)} ${doc?.session.status === 'running' ? 'withdrew the question' : 'session ended'}.`;
    }
    rec.closed = true;
    this.asks.write(asks);
    const detail = this.store.read().notify.detail;
    await this.call('chat.update', {
      channel: rec.channel,
      ts: rec.ts,
      ...askClosedMessage(rec.view, line, { detail, answered }),
    }).catch(() => {});
  }

  private async inboxMessage() {
    const docs = await readAgentDocs(this.o.root);
    const pending = docs.flatMap((d) => d.pending);
    if (!pending.length) return { text: 'Nothing is waiting on you.' };
    const adapter = await this.o.active();
    const url = this.o.url();
    const blocks = (
      await Promise.all(
        pending.slice(0, 10).map(async (q) => askMessage(await this.askView(q, adapter), { url }).blocks),
      )
    ).flat();
    return { text: `${pending.length} waiting on you`, blocks };
  }

  private async statusMessage(arg: string, command: string) {
    const adapter = await this.o.active();
    const maps = await adapter.listMaps();
    const docs = await readAgentDocs(this.o.root);
    const now = Date.now();
    if (arg) {
      const a = arg.toLowerCase().replace(/^#/, '');
      const m =
        maps.find((x) => x.key.toLowerCase().replace(/^#/, '') === a || x.id === arg) ??
        maps.find((x) => x.title.toLowerCase().includes(a));
      if (!m) return { text: `No mission matches “${escape(arg)}”.` };
      return statusBlocks(briefMission(await adapter.loadMap(m.id), docs), { now, url: this.o.url() });
    }
    const briefs = await Promise.all(
      maps.slice(0, 20).map(async (m) => briefMission(await adapter.loadMap(m.id), docs)),
    );
    return missionListBlocks(briefs, command);
  }

  /* ---------------- polling: asks and notifications ---------------- */

  /** Deliver new agent questions, close answered ones, and notify mission changes. */
  tick(): Promise<void> {
    this.ticking ??= this.runTick().finally(() => (this.ticking = undefined));
    return this.ticking;
  }

  private async runTick() {
    const c = this.store.read();
    if (this.state !== 'online' || !c.owners.length || !this.bot) return;
    try {
      const docs = await readAgentDocs(this.o.root);
      await this.syncAsks(docs, c);
      if (this.ticks++ % (this.o.missionEvery ?? 5) === 0) await this.syncMissions(docs, c);
      await this.flushBatches();
    } catch {
      /* Slack or the tracker is unreachable: try again on the next tick */
    }
  }

  private async syncAsks(docs: AgentSessionDoc[], c: SlackConfig) {
    const asks = this.asks.read();
    const open = new Set<string>();
    let adapter: TrackerAdapter | undefined;
    for (const d of docs)
      for (const q of d.pending) {
        open.add(q.id);
        if (asks[q.id] || !c.notify.events.includes('awaiting')) continue;
        const channel = await this.target();
        if (!channel) return;
        adapter ??= await this.o.active();
        const view = await this.askView(q, adapter);
        const r = await this.call<{ channel: string; ts: string }>('chat.postMessage', {
          channel,
          ...askMessage(view, { url: this.o.url(), detail: c.notify.detail }),
        });
        asks[q.id] = { sessionId: q.sessionId, channel: r.channel, ts: r.ts, view };
        this.asks.write(asks);
      }
    for (const [id, rec] of Object.entries(asks)) if (!rec.closed && !open.has(id)) await this.closeAsk(id, docs);
  }

  private async syncMissions(docs: AgentSessionDoc[], c: SlackConfig) {
    const adapter = await this.o.active();
    const ev = new Set(c.notify.events);
    for (const m of await adapter.listMaps()) {
      const snap = await adapter.loadMap(m.id);
      const states = deriveStates(snap.tickets, snap.map.mode);
      const byId = new Map(snap.tickets.map((t) => [t.id, t]));
      const now: MissionNotes = {
        known: new Set(snap.tickets.map((t) => t.id)),
        blocked: new Set(snap.tickets.filter((t) => states.get(t.id) === 'blocked').map((t) => t.id)),
        closed: new Set(snap.tickets.filter((t) => t.state === 'closed').map((t) => t.id)),
        done: snap.tickets.length > 0 && snap.tickets.every((t) => t.state === 'closed'),
      };
      const prev = this.missions.get(m.id);
      this.missions.set(m.id, now);
      if (!prev) continue;
      const title = escape(snap.map.title);
      if (ev.has('blocked'))
        for (const id of now.blocked)
          if (prev.known.has(id) && !prev.blocked.has(id)) {
            const t = byId.get(id)!;
            const by = t.blockedBy
              .map((b) => byId.get(b))
              .filter((b) => b && b.state === 'open')
              .map((b) => `${b!.key} ${b!.title}`);
            this.queue(
              m.id,
              `⛔ *BLOCKED* · ${title} · ${escape(t.key)} ${escape(t.title)}${by.length ? ` is blocked by ${escape(by.join(', '))}` : ''}`,
            );
          }
      if (ev.has('resolved'))
        for (const id of now.closed)
          if (!prev.closed.has(id) && byId.get(id)?.closeReason === 'completed') {
            const t = byId.get(id)!;
            const unblocked = [...prev.blocked].filter(
              (b) => !now.blocked.has(b) && byId.get(b)?.state === 'open' && byId.get(b)?.blockedBy.includes(id),
            ).length;
            this.queue(
              m.id,
              `✓ *RESOLVED* · ${title} · ${escape(t.key)} ${escape(t.title)}${unblocked ? ` → ${unblocked} ticket${unblocked === 1 ? '' : 's'} unblocked` : ''}`,
            );
          }
      if (ev.has('mission.done') && now.done && !prev.done) {
        const b = briefMission(snap, docs);
        this.queue(
          m.id,
          `◉ *MISSION DONE* · ${title} · ${b.total} tickets · $${b.costUsd.toFixed(2)} · ${formatTokens(b.tokens)} tokens`,
        );
      }
    }
  }

  private queue(mapId: string, line: string) {
    const b = this.batches.get(mapId) ?? { lines: [], lastAt: 0 };
    b.lines.push(line);
    this.batches.set(mapId, b);
  }

  /** One message per mission per window; later ones thread under that day's first message for the mission. */
  private async flushBatches() {
    const now = Date.now();
    for (const b of this.batches.values()) {
      if (!b.lines.length || now - b.lastAt < (this.o.batchMs ?? 30_000)) continue;
      const channel = await this.target();
      if (!channel) return;
      const text = b.lines.join('\n');
      const today = day(now);
      const thread = b.root?.day === today ? b.root.ts : undefined;
      const r = await this.call<{ ts: string }>('chat.postMessage', {
        channel,
        text,
        ...(thread ? { thread_ts: thread } : {}),
      });
      if (!thread) b.root = { day: today, ts: r.ts };
      b.lines = [];
      b.lastAt = now;
    }
  }
}

export type { AskRecord };
