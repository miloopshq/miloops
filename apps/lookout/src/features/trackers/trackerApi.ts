import { trackerSettingsApi, BRAND } from '@teamtrail/core';
import type { Prefs, TrackerChoice } from '../../lib';

export const trackerApi = trackerSettingsApi(BRAND.apiPrefix);

export function switchTracker(update: (p: Partial<Prefs>) => void, tracker: TrackerChoice) {
  update({ tracker });
  const url = new URL(location.href);
  url.searchParams.delete('tracker');
  location.href = url.toString();
}
