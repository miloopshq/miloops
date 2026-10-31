import { BRAND } from '@miloops-hq/core';

/** Bot scopes, and why: see the Slack integration plan. Nothing else is requested (no user tokens, no admin, no search). */
export const BOT_SCOPES = [
  'commands',
  'chat:write',
  'im:write',
  'channels:history',
  'groups:history',
  'im:history',
  'mpim:history',
  'users:read',
] as const;

/** Requested, but setup works without them: `users:read.email` lets MILO recognise the owner by their git email. */
export const OPTIONAL_SCOPES = ['users:read.email'] as const;

export const SAVE_DECISION_CALLBACK = 'save_decision';
export const DEFAULT_COMMAND = `/${BRAND.assistant.name.toLowerCase()}`;

/** The app manifest the user creates their own Slack app from: Socket Mode, `/milo`, "Save as decision", App Home. */
export function slackManifest(o: { command?: string } = {}) {
  const name = BRAND.assistant.name;
  return {
    display_information: {
      name,
      description: `${BRAND.name} decisions and agent questions`,
      background_color: '#1b2226',
    },
    features: {
      app_home: { home_tab_enabled: true, messages_tab_enabled: true, messages_tab_read_only_enabled: false },
      bot_user: { display_name: name, always_online: true },
      slash_commands: [
        {
          command: o.command ?? DEFAULT_COMMAND,
          description: 'Record a decision, check a mission, answer agents',
          usage_hint: 'decide [text] | status [mission] | inbox | help',
          should_escape: false,
        },
      ],
      shortcuts: [
        {
          name: 'Save as decision',
          type: 'message',
          callback_id: SAVE_DECISION_CALLBACK,
          description: `Record this thread as a ${BRAND.name} decision`,
        },
      ],
    },
    oauth_config: { scopes: { bot: [...BOT_SCOPES, ...OPTIONAL_SCOPES] } },
    settings: {
      event_subscriptions: { bot_events: ['app_home_opened'] },
      interactivity: { is_enabled: true },
      org_deploy_enabled: false,
      socket_mode_enabled: true,
      token_rotation_enabled: false,
    },
  };
}

export const slackLinks = {
  /** Slack's "create from manifest" page, pre-filled. */
  create: (command?: string) =>
    `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(JSON.stringify(slackManifest({ command })))}`,
  /** Basic Information: where App-Level Tokens are generated. */
  app: (appId: string) => `https://api.slack.com/apps/${appId}/general`,
  /** Install App page: Install to Workspace, then the Bot User OAuth Token. */
  install: (appId: string) => `https://api.slack.com/apps/${appId}/install-on-team`,
  /** The app's Home tab in the Slack desktop app. */
  home: (teamId: string, appId: string) => `slack://app?team=${teamId}&id=${appId}&tab=home`,
  homeWeb: (teamId: string, appId: string) => `https://slack.com/app_redirect?app=${appId}&team=${teamId}`,
};

/** Routes a pasted token by prefix. */
export function tokenKind(token: string): 'app' | 'bot' | 'user' | 'config' | 'unknown' {
  const t = token.trim();
  if (t.startsWith('xapp-')) return 'app';
  if (t.startsWith('xoxb-')) return 'bot';
  if (t.startsWith('xoxp-')) return 'user';
  if (t.startsWith('xoxe')) return 'config';
  return 'unknown';
}

/** App-level tokens look like `xapp-1-A0123ABCD-<n>-<hex>`; the third part is the app ID. */
export function appIdFromToken(token: string): string | undefined {
  const m = token.trim().match(/^xapp-\d+-(A[A-Z0-9]+)-/);
  return m?.[1];
}
