import { BRAND } from '@miloops-hq/core';

/**
 * One shared `/events` stream for "a tracker file changed" messages. Browsers allow only six connections per host,
 * and every EventSource holds one open, so hooks subscribe here instead of opening their own.
 */
let stream: EventSource | undefined;
const listeners = new Set<(path: string) => void>();

export function onTrackerChange(listener: (path: string) => void) {
  listeners.add(listener);
  if (!stream) {
    stream = new EventSource(`${BRAND.apiPrefix}/events`);
    stream.onmessage = (m) => {
      const p = (JSON.parse(m.data) as { path?: unknown }).path;
      if (typeof p === 'string') for (const l of listeners) l(p);
    };
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stream?.close();
      stream = undefined;
    }
  };
}
