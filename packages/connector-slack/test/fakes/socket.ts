import type { WebSocketLike } from '../../src/socket';

/**
 * In-process Socket Mode server. Each `apps.connections.open` URL connects
 * here; the hub says `hello`, delivers envelopes to the newest open socket and
 * resolves with the client's ack payload, as Slack's servers do.
 */
export function socketHub(o: { appId?: string } = {}) {
  const state = { linkDisabled: false };
  const sockets: FakeSocket[] = [];
  const acks = new Map<string, (payload: unknown) => void>();
  const sent: string[] = [];
  let seq = 0;
  let connections = 0;

  class FakeSocket implements WebSocketLike {
    readyState = 0;
    private l: Record<string, ((e: { data: unknown }) => void)[]> = {};
    constructor(readonly url: string) {
      sockets.push(this);
      connections++;
      queueMicrotask(() => {
        if (this.readyState !== 0) return;
        this.readyState = 1;
        this.emit('open');
        const msg = state.linkDisabled
          ? { type: 'disconnect', reason: 'link_disabled', debug_info: { host: 'wss-primary.slack.test' } }
          : {
              type: 'hello',
              num_connections: sockets.filter((s) => s.readyState === 1).length,
              debug_info: { host: 'wss-primary.slack.test', approximate_connection_time: 18060 },
              connection_info: { app_id: o.appId ?? 'A0Scout0001' },
            };
        this.emit('message', { data: JSON.stringify(msg) });
      });
    }
    addEventListener(type: string, fn: (e: { data: unknown }) => void) {
      (this.l[type] ??= []).push(fn);
    }
    emit(type: string, e: { data: unknown } = { data: undefined }) {
      for (const fn of this.l[type] ?? []) fn(e);
    }
    send(data: string) {
      const m = JSON.parse(data) as { envelope_id: string; payload?: unknown };
      sent.push(m.envelope_id);
      acks.get(m.envelope_id)?.(m.payload);
      acks.delete(m.envelope_id);
    }
    close() {
      if (this.readyState >= 2) return;
      this.readyState = 3;
      queueMicrotask(() => this.emit('close'));
    }
  }

  const live = () => sockets.filter((s) => s.readyState === 1).at(-1);

  return {
    state,
    /** Envelope ids acked by the client, in send order. */
    sent,
    WebSocket: FakeSocket as unknown as new (url: string) => WebSocketLike,
    get connections() {
      return connections;
    },
    get open() {
      return sockets.filter((s) => s.readyState === 1).length;
    },
    /** Delivers an envelope; resolves with the ack payload (undefined for a bare ack). */
    envelope(e: { type: string; payload: unknown }): Promise<unknown> {
      const ws = live();
      if (!ws) throw new Error('no open Socket Mode connection');
      const envelope_id = `env-${String(++seq).padStart(4, '0')}`;
      const p = new Promise<unknown>((r) => acks.set(envelope_id, r));
      ws.emit('message', {
        data: JSON.stringify({
          envelope_id,
          type: e.type,
          payload: e.payload,
          accepts_response_payload: e.type !== 'events_api',
        }),
      });
      return p;
    },
    /** Slack asks for a reconnect (sent before rotating a connection). */
    refresh() {
      live()?.emit('message', { data: JSON.stringify({ type: 'disconnect', reason: 'refresh_requested' }) });
    },
    /** The server drops the socket without warning. */
    drop() {
      const ws = live();
      if (ws) {
        ws.readyState = 3;
        ws.emit('close');
      }
    },
  };
}
export type SocketHub = ReturnType<typeof socketHub>;
