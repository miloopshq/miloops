import type { TrackerAdapter } from '../adapter';

class NotConnected extends Error {}

/**
 * Placeholders for remote trackers. They document the intended mapping and
 * fail loudly until implemented; Settings lists them as "coming soon".
 */
abstract class StubAdapter implements TrackerAdapter {
  abstract readonly kind: 'github' | 'linear';
  abstract readonly label: string;
  constructor(readonly location: string) {}
  private fail(): never {
    throw new NotConnected(`${this.label} connector is not implemented yet`);
  }
  async listMaps(): Promise<never> { this.fail(); }
  async loadMap(): Promise<never> { this.fail(); }
  async createMap(): Promise<never> { this.fail(); }
  async updateMapSections(): Promise<never> { this.fail(); }
  async setMapMode(): Promise<never> { this.fail(); }
  async createTicket(): Promise<never> { this.fail(); }
  async addBlocking(): Promise<never> { this.fail(); }
  async assign(): Promise<never> { this.fail(); }
  async comment(): Promise<never> { this.fail(); }
  async close(): Promise<never> { this.fail(); }
  async listDecisions(): Promise<never> { this.fail(); }
  async createDecision(): Promise<never> { this.fail(); }
  async markSuperseded(): Promise<never> { this.fail(); }
  subscribe() { return () => {}; }
}

/** Map = issue with MAP_LABEL; tickets = sub-issues; blocking = issue dependencies; claim = assignee. */
export class GitHubAdapter extends StubAdapter {
  readonly kind = 'github' as const;
  readonly label = 'GitHub Issues';
}

/** Map = issue with MAP_LABEL; tickets = sub-issues; blocking = "blocked by" relation; claim = assignee. */
export class LinearAdapter extends StubAdapter {
  readonly kind = 'linear' as const;
  readonly label = 'Linear';
}
