import { Emitter } from '../../../lib/emitter';
import { TrackerError, type RateInfo } from '../http';
import type { SyncStatus } from './types';

export interface SyncHealthOptions {
  now: () => number;
  queued: () => number;
  rate: () => RateInfo | undefined;
}

/** The adapter's `SyncStatus`, moved by request outcomes and published to `onStatus` listeners. */
export class SyncHealth {
  private current: SyncStatus;
  private events = new Emitter<SyncStatus>();

  constructor(private readonly o: SyncHealthOptions) {
    this.current = { state: 'connecting', queued: o.queued() };
  }

  get status(): SyncStatus {
    return this.current;
  }

  onStatus(fn: (s: SyncStatus) => void) {
    return this.events.on(fn);
  }

  set(patch: Partial<SyncStatus>) {
    this.current = { ...this.current, ...patch, queued: this.o.queued(), rate: this.o.rate() ?? this.current.rate };
    this.events.emit(this.current);
  }

  online() {
    if (this.current.state !== 'online' || this.current.error)
      this.set({ state: 'online', error: undefined, resetAt: undefined, lastSyncAt: this.o.now() });
    else this.current = { ...this.current, lastSyncAt: this.o.now(), rate: this.o.rate() ?? this.current.rate };
  }

  failed(err: unknown) {
    const e = err as TrackerError;
    if (e instanceof TrackerError && e.code === 'offline') this.set({ state: 'offline', error: e.message });
    else if (e instanceof TrackerError && e.code === 'rate_limited')
      this.set({ state: 'rate-limited', resetAt: e.resetAt, error: e.message });
    else if (e instanceof TrackerError && e.code === 'auth') this.set({ state: 'auth-error', error: e.message });
    else this.set({ error: String((err as Error)?.message ?? err) });
  }

  /** Records an error without notifying listeners; the next status change carries it. */
  note(error: string) {
    this.current = { ...this.current, error };
  }
}
