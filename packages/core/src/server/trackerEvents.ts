import type { IncomingMessage, ServerResponse } from 'node:http';
import { TrackerError } from '../adapters/remote/http';
import type { SyncedAdapter } from '../adapters/remote/sync/syncedAdapter';
import { openEventStream } from './http';

/** SSE: each TrackerEvent as a message, plus named `status` events (SyncStatus & { location }). */
export function streamTrackerEvents(adapter: () => Promise<SyncedAdapter>, req: IncomingMessage, res: ServerResponse) {
  openEventStream(res);
  let off = () => {};
  let closed = false;
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    closed = true;
    clearInterval(ping);
    off();
  });
  adapter().then(
    (a) => {
      if (closed) return;
      const status = () =>
        res.write(`event: status\ndata: ${JSON.stringify({ ...a.status, location: a.location })}\n\n`);
      const offEvents = a.subscribe((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
      const offStatus = a.onStatus(status);
      off = () => {
        offEvents();
        offStatus();
      };
      status();
    },
    (e: Error) =>
      res.write(
        `event: status\ndata: ${JSON.stringify({ state: e instanceof TrackerError && e.code === 'auth' ? 'auth-error' : 'offline', queued: 0, error: e.message })}\n\n`,
      ),
  );
}
