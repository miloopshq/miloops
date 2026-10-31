/** A Slack message as the summary needs it. Raw messages are held only in memory while the modal is open. */
export interface ThreadMessage {
  ts: string;
  user?: string;
  name: string;
  text: string;
}

const trim = (s: string, n = 220) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

/** Slack markup to plain text: `<@U1>` → `@name`, `<url|label>` → label, `<#C1|name>` → `#name`. */
export function plainText(text: string, names: Record<string, string> = {}) {
  return text
    .replace(/<@([UW][A-Z0-9]+)(?:\|[^>]+)?>/g, (_m, id: string) => `@${names[id] ?? id}`)
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<(https?:[^>]+)>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Deterministic thread summary: first message, the clicked message, and the last two replies, each trimmed.
 * Used when `slack.summary` is `deterministic` or no model is available; the user can edit it before saving.
 */
export function deterministicSummary(messages: ThreadMessage[], clickedTs?: string): string {
  if (!messages.length) return '';
  const picked = [messages[0], messages.find((m) => m.ts === clickedTs), ...messages.slice(-2)].filter((m): m is ThreadMessage => !!m);
  const seen = new Set<string>();
  return picked
    .filter((m) => !seen.has(m.ts) && seen.add(m.ts))
    .sort((a, b) => Number(a.ts) - Number(b.ts))
    .map((m) => `${m.name}: ${trim(m.text)}`)
    .join('\n');
}
