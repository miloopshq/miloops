import type { AttentionView, PendingQuestion } from '@teamtrail/core';

/** `ask`: its own message with answer buttons. `digest`: a line in the trail's next digest. */
export type AskRoute = 'ask' | 'digest';

/**
 * Where an open agent question goes in Slack. Without a queue (interrupt gating off) every question is an ask.
 * With one, only questions the queue marks interrupting are; choosing no notifications sends everything to the digest.
 */
export function askRoute(
  q: Pick<PendingQuestion, 'id'>,
  view?: Pick<AttentionView, 'items' | 'interrupting' | 'prefs'>,
): AskRoute {
  if (!view) return 'ask';
  if (view.prefs.channel === 'none') return 'digest';
  const item = view.items.find((i) => i.kind === 'question' && i.ref === q.id);
  if (item && view.interrupting.includes(item.id)) return 'ask';
  return 'digest';
}
