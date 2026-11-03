/**
 * Socket Mode: an outbound WebSocket from this machine to Slack, so commands,
 * shortcuts and clicks arrive without a public URL, tunnel or relay.
 * https://api.slack.com/apis/socket-mode
 */

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (e: { data: unknown }) => void): void;
}
export type WebSocketCtor = new (url: string) => WebSocketLike;

export interface Envelope {
  envelope_id: string;
  type: 'events_api' | 'slash_commands' | 'interactive';
  payload: Record<string, unknown>;
  accepts_response_payload?: boolean;
}

/** What to send back within Slack's 3 s, and the slow work to do after the ack. */
export interface EnvelopeResult {
  ack?: unknown;
  after?: () => Promise<void>;
}

export type SocketState = 'connecting' | 'online' | 'offline' | 'auth-error';

export interface SocketModeOptions {
  /** `apps.connections.open` with the app-level token; resolves to the wss URL. */
  open: () => Promise<string>;
  WebSocket: WebSocketCtor;
  onEnvelope: (e: Envelope) => Promise<EnvelopeResult | void>;
  onState: (s: SocketState, error?: string) => void;
  /** Called with errors from `open` to decide whether retrying makes sense. */
  fatal?: (err: unknown) => string | undefined;
  backoffMs?: (attempt: number) => number;
}

const text = (d: unknown) => {
  if (typeof d === 'string') return d;
  if (d instanceof ArrayBuffer) return new TextDecoder().decode(d);
  return String(d);
};

export class SocketMode {
  private ws?: WebSocketLike;
  private stopped = true;
  private attempt = 0;
  private timer?: ReturnType<typeof setTimeout>;
  /** Background work started after acks; `idle()` waits for it. */
  private work = new Set<Promise<void>>();

  constructor(private o: SocketModeOptions) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    void this.connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    const ws = this.ws;
    this.ws = undefined;
    if (ws && ws.readyState <= 1) ws.close(1000, 'stopped');
  }

  async idle() {
    while (this.work.size) await Promise.allSettled([...this.work]);
  }

  private retry(error?: string) {
    if (this.stopped) return;
    this.o.onState('offline', error);
    const ms = this.o.backoffMs?.(this.attempt) ?? Math.min(30_000, 1000 * 2 ** this.attempt);
    this.attempt++;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.connect(), ms);
    (this.timer as { unref?: () => void }).unref?.();
  }

  private async connect() {
    if (this.stopped) return;
    this.o.onState('connecting');
    let url: string;
    try {
      url = await this.o.open();
    } catch (err) {
      const fatal = this.o.fatal?.(err);
      if (fatal) {
        this.stopped = true;
        this.o.onState('auth-error', fatal);
      } else this.retry((err as Error).message);
      return;
    }
    if (this.stopped) return;
    const ws = new this.o.WebSocket(url);
    this.ws = ws;
    ws.addEventListener('message', (e) => this.onMessage(ws, text(e.data)));
    ws.addEventListener('close', () => {
      if (this.ws !== ws) return;
      this.ws = undefined;
      this.retry();
    });
    ws.addEventListener('error', () => {});
  }

  private onMessage(ws: WebSocketLike, raw: string) {
    let msg: { type?: string; reason?: string; envelope_id?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === 'hello') {
      this.attempt = 0;
      this.o.onState('online');
      return;
    }
    if (msg.type === 'disconnect') {
      if (msg.reason === 'link_disabled') {
        this.stopped = true;
        this.ws = undefined;
        ws.close();
        this.o.onState('auth-error', 'Socket Mode was turned off for this app');
        return;
      }
      // refresh_requested / warning: Slack closes this socket soon; open the next one now.
      this.ws = undefined;
      ws.close();
      void this.connect();
      return;
    }
    if (!msg.envelope_id) return;
    const env = msg as Envelope;
    const job = (async () => {
      let result: EnvelopeResult | void;
      try {
        result = await this.o.onEnvelope(env);
      } catch {
        result = undefined;
      }
      if (ws.readyState === 1)
        ws.send(
          JSON.stringify(
            result?.ack === undefined
              ? { envelope_id: env.envelope_id }
              : { envelope_id: env.envelope_id, payload: result.ack },
          ),
        );
      await result?.after?.().catch(() => {});
    })();
    this.work.add(job);
    void job.finally(() => this.work.delete(job));
  }
}

/** Opens a socket once and waits for Slack's `hello`: proves the app-level token works and Socket Mode is on. */
export function probeSocket(url: string, WS: WebSocketCtor, timeoutMs = 5000): Promise<{ appId?: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WS(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('timeout'));
    }, timeoutMs);
    ws.addEventListener('message', (e) => {
      try {
        const m = JSON.parse(text(e.data)) as { type?: string; reason?: string; connection_info?: { app_id?: string } };
        if (m.type === 'hello') {
          clearTimeout(timer);
          ws.close();
          resolve({ appId: m.connection_info?.app_id });
        } else if (m.type === 'disconnect' && m.reason === 'link_disabled') {
          clearTimeout(timer);
          ws.close();
          reject(new Error('link_disabled'));
        }
      } catch {
        /* ignore */
      }
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('socket error'));
    });
  });
}
