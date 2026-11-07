/** Browser-safe types shared by the local server (`/slack` routes) and Settings. No secrets cross this boundary. */

export type SlackState = 'off' | 'connecting' | 'online' | 'offline' | 'auth-error' | 'elsewhere' | 'unsupported';

/** Where a token came from. Values never leave the machine running `teamtrail`. */
export type SlackTokenSource = 'stored' | 'TEAMTRAIL_SLACK_APP_TOKEN' | 'TEAMTRAIL_SLACK_BOT_TOKEN';

export type SlackNotifyEvent = 'awaiting' | 'blocked' | 'trail.done' | 'resolved';
export const SLACK_NOTIFY_EVENTS: SlackNotifyEvent[] = ['awaiting', 'blocked', 'trail.done', 'resolved'];
export const DEFAULT_NOTIFY_EVENTS: SlackNotifyEvent[] = ['awaiting', 'blocked', 'trail.done'];

export interface SlackUser {
  id: string;
  name?: string;
  /** How the owner was identified: their git email matched a workspace member, or "This is me" on the Home tab. */
  via?: 'git-email' | 'home';
}

export interface SlackNotify {
  /** `dm` (the owner's DM with Scout) or a channel id. */
  target: 'dm' | string;
  events: SlackNotifyEvent[];
  /** `titles-only` hides ask bodies, for channel targets. */
  detail: 'full' | 'titles-only';
}

/** 1 create app · 2 pick workspace (Slack) · 3 app-level token · 4 install + bot token · 5 owner claim. */
export type SlackSetupStep = 1 | 2 | 3 | 4 | 5 | 'done';

/** `GET <api>/slack`. */
export interface SlackStatus {
  state: SlackState;
  error?: string;
  enabled: boolean;
  step: SlackSetupStep;
  setup: {
    created: boolean;
    appId?: string;
    appToken: SlackTokenSource | null;
    botToken: SlackTokenSource | null;
  };
  workspace?: { id: string; name: string; url: string };
  bot?: { userId: string; name?: string };
  owners: SlackUser[];
  allow: SlackUser[];
  notify: SlackNotify;
  command: string;
  links: { create: string; app?: string; install?: string; home?: string; homeWeb?: string };
  /** Tracker folder of the other `teamtrail` that holds this machine's Slack connection. */
  heldBy?: string;
}

export interface SlackTokenResult {
  ok: boolean;
  kind?: 'app' | 'bot';
  error?: string;
  code?: string;
  status: SlackStatus;
}

export interface SlackSettingsPatch {
  enabled?: boolean;
  allow?: SlackUser[];
  notify?: Partial<SlackNotify>;
}
