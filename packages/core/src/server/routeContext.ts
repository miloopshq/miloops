import type { TrackerAdapter } from '../adapters/adapter';

/** What a bridge route handler needs: the tracker folder, and the adapter the project is connected to now. */
export interface RouteContext {
  root: string;
  active: () => Promise<TrackerAdapter>;
}
