import { sleep } from '../emitter';
import { attention, frontier } from '../derive';
import { runWork, type ProcedureContext } from './procedures';

import { callsign } from '../integrations';

const AGENTS = [12, 21, 49, 16, 33].map((n) => callsign(n));

/**
 * Keeps a simulated fleet of parallel "work through the map" sessions running
 * against the current map. Only AFK tickets are picked; HITL ones wait for the operator.
 */
export class Autopilot {
  private running = false;
  private inFlight = new Set<string>();
  private n = 0;

  constructor(
    private ctx: ProcedureContext,
    private getMapId: () => string | undefined,
    private opts: { maxParallel?: number; interval?: number } = {},
  ) {}

  get active() {
    return this.running;
  }

  start() {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop() {
    this.running = false;
  }

  private async loop() {
    await sleep(1500);
    while (this.running) {
      const mapId = this.getMapId();
      if (mapId && this.inFlight.size < (this.opts.maxParallel ?? 2)) {
        try {
          const snap = await this.ctx.adapter.loadMap(mapId);
          const candidates = frontier(snap.tickets, snap.map.mode).filter((t) => attention(t) === 'afk');
          if (candidates.length) {
            const agent = AGENTS[this.n++ % AGENTS.length];
            const key = `${agent}:${this.n}`;
            this.inFlight.add(key);
            this.ctx.activity.push({ source: 'system', level: 'info', ticketId: candidates[0].id, text: `Dispatching ${agent} · ${candidates[0].key} ${candidates[0].title}` });
            void runWork(this.ctx, { mapId, agent, ticketId: candidates[0].id }).finally(() => this.inFlight.delete(key));
          }
        } catch {
          // map may be mid-creation; retry next tick
        }
      }
      await sleep((this.opts.interval ?? 4200) * (0.8 + Math.random() * 0.5));
    }
  }
}
