import { BRAND, type AttentionItem, type AttentionView } from '@miloops-hq/core';
import { useEffect, useRef } from 'react';

function canNotify(view: AttentionView) {
  if (view.prefs.channel !== 'browser') return false;
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

function notify(item: AttentionItem) {
  const n = new Notification(`${BRAND.name} · needs you`, { body: item.title, tag: item.id });
  n.onclick = () => {
    window.focus();
    n.close();
  };
}

/**
 * Browser notifications for items that start interrupting: at or above the team's threshold, outside focus.
 * Only new ones notify; what was already interrupting when the page opened doesn't. Everything else just waits.
 */
export function useAttentionNotifications(view?: AttentionView) {
  const seen = useRef<Set<string>>();
  useEffect(() => {
    if (!view) return;
    const now = new Set(view.interrupting);
    const before = seen.current;
    seen.current = now;
    if (!before || !canNotify(view)) return;
    for (const item of view.items) if (now.has(item.id) && !before.has(item.id)) notify(item);
  }, [view]);
}
