/** Browser-safe types shared by the local server (`/slack` routes) and Settings. No secrets cross this boundary. */

export type SlackState = 'off' | 'connecting' | 'online' | 'offline' | 'auth-error' | 'elsewhere' | 'unsupported';

/** Where a token came from. Values never leave the machine running `miloops`. */
export type SlackTokenSource = 'stored' | 'MILOOPS_SLACK_APP_TOKEN' | 'MILOOPS_SLACK_BOT_TOKEN';

export type SlackNotifyEvent = 'awaiting' | 'blocked' | 'mission.done' | 'resolved';
export const SLACK_NOTIFY_EVENTS: SlackNotifyEvent[] = ['awaiting', 'blocked', 'mission.done', 'resolved'];
export const DEFAULT_NOTIFY_EVENTS: SlackNotifyEvent[] = ['awaiting', 'blocked', 'mission.done'];

export interface SlackUser {
  id: string;
  name?: string;
}

export interface SlackNotify {
  /** `dm` (the owner's DM with MILO) or a channel id. */
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
  summary: 'milo' | 'deterministic';
  command: string;
  links: { create: string; app?: string; install?: string; home?: string; homeWeb?: string };
  /** Tracker folder of the other `miloops` that holds this machine's Slack connection. */
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
  summary?: SlackStatus['summary'];
}
