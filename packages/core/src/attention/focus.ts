import type { AttentionItem, AttentionPolicy, AttentionPrefs, FocusHours } from '../model/attention';

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Inside the daily focus window, in the machine's local time; `to` before `from` spans midnight. */
function inFocusHours(focus: FocusHours, now: number): boolean {
  const at = new Date(now);
  const minute = at.getHours() * 60 + at.getMinutes();
  const from = minutesOf(focus.from);
  const to = minutesOf(focus.to);
  const overnight = to <= from;
  const inside = overnight ? minute >= from || minute < to : minute >= from && minute < to;
  if (!inside) return false;
  if (!focus.days) return true;
  // After midnight in an overnight window, the window belongs to the day it started.
  const startedYesterday = overnight && minute < to;
  const day = (at.getDay() + (startedYesterday ? 6 : 0)) % 7;
  return focus.days.includes(day);
}

/** Focus mode switched on by hand, or the daily focus hours: interruptions wait, the queue doesn't. */
export function isFocused(prefs: AttentionPrefs, now: number): boolean {
  if ((prefs.focusUntil ?? 0) > now) return true;
  return prefs.focus ? inFocusHours(prefs.focus, now) : false;
}

/**
 * Whether an item should notify actively (browser notification, Slack message) right now: it scores at
 * or above the team's threshold and the person isn't focusing. Everything else waits in the queue and
 * the digest. `prefs.channel` only says where a notification goes. Teamtrail never answers on anyone's
 * behalf; this only decides when to tap a shoulder.
 */
export function isInterrupting(item: AttentionItem, policy: AttentionPolicy, prefs: AttentionPrefs, now: number) {
  return item.score >= policy.interrupt && !isFocused(prefs, now);
}
