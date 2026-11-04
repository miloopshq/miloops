import { BRAND } from '@miloops-hq/core';

/**
 * One shared `/events` stream for "a tracker file changed" messages and named events (`replan`, …). Browsers allow
 * only six connections per host, and every EventSource holds one open, so hooks subscribe here instead of opening
 * their own.
 */
let stream: EventSource | undefined;
const listeners = new Set<(path: string) => void>();
const subscribers = new Set<{ event: string; fn: (data: unknown) => void }>();
const attached = new Set<string>();

function openStream() {
  if (stream) return stream;
  stream = new EventSource(`${BRAND.apiPrefix}/events`);
  stream.onmessage = (m) => {
    const p = (JSON.parse(m.data) as { path?: unknown }).path;
    if (typeof p === 'string') for (const l of listeners) l(p);
  };
  return stream;
}

function closeWhenUnused() {
  if (listeners.size || subscribers.size) return;
  stream?.close();
  stream = undefined;
  attached.clear();
}

/** Calls `listener` with the path of every tracker file that changes. Returns the unsubscribe. */
export function onTrackerChange(listener: (path: string) => void) {
  listeners.add(listener);
  openStream();
  return () => {
    listeners.delete(listener);
    closeWhenUnused();
  };
}

/** Calls `fn` with the parsed data of every named `event` on the same stream. Returns the unsubscribe. */
export function onTrackerEvent(event: string, fn: (data: unknown) => void) {
  const sub = { event, fn };
  subscribers.add(sub);
  const s = openStream();
  if (!attached.has(event)) {
    attached.add(event);
    s.addEventListener(event, (m) => {
      const data = JSON.parse((m as MessageEvent<string>).data) as unknown;
      for (const x of subscribers) if (x.event === event) x.fn(data);
    });
  }
  return () => {
    subscribers.delete(sub);
    closeWhenUnused();
  };
}
