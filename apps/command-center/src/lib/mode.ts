import { PREFS_KEY } from '@miloops-hq/core';
import { loadPrefs, type Prefs } from './prefs';

/** Demo and real use never mix: switching saves the choice and reloads into the other mode. */
function reloadWith(patch: Partial<Prefs>) {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  const url = new URL(location.href);
  url.searchParams.delete('tracker');
  location.href = url.toString();
}

/** Into the in-memory demo: a ready-made mission and simulated agents, nothing saved. */
export const startDemo = () => reloadWith({ tracker: 'demo', onboarded: true });

/** Out of the demo, back to setup to pick where this project's real missions live. */
export const leaveDemo = () => reloadWith({ tracker: 'markdown', onboarded: false });
