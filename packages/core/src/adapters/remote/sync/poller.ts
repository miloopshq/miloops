import { TrackerError } from '../http';

export interface PollerOptions {
  pollMs: number;
  maxBackoffMs: number;
  /** No timers: `tick()` is driven by the caller. */
  manual: boolean;
  now: () => number;
  /** Nothing to poll for right now; scheduling is skipped. */
  idle: () => boolean;
  run: () => Promise<void>;
  failed: (err: unknown) => void;
}

/** Runs `run` every `pollMs`, backing off exponentially (or until a rate limit resets) after failures. */
export class Poller {
  private timer?: ReturnType<typeof setTimeout>;
  private failures = 0;

  constructor(private readonly o: PollerOptions) {}

  schedule(ms: number) {
    clearTimeout(this.timer);
    if (this.o.manual || this.o.idle()) return;
    this.timer = setTimeout(() => void this.tick(), ms);
    (this.timer as { unref?: () => void }).unref?.();
  }

  async tick() {
    try {
      await this.o.run();
      this.failures = 0;
      this.schedule(this.o.pollMs);
    } catch (err) {
      this.o.failed(err);
      const e = err as TrackerError;
      const wait =
        e instanceof TrackerError && e.code === 'rate_limited' && e.resetAt
          ? e.resetAt - this.o.now()
          : this.o.pollMs * 2 ** ++this.failures;
      this.schedule(Math.max(1000, Math.min(this.o.maxBackoffMs, wait)));
    }
  }

  stop() {
    clearTimeout(this.timer);
  }
}
