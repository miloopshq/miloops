import { type HitlTranscriptMode, PRIMARY_AGENT, PREFS_KEY } from '@miloops-hq/core';

/** GitHub and Linear are configured on the local server (repo/team and credentials); prefs only pick which one this browser shows. */
export type TrackerChoice = 'markdown' | 'demo' | 'github' | 'linear';

export interface Prefs {
  onboarded: boolean;
  tracker: TrackerChoice;
  hitlTranscript: HitlTranscriptMode;
  agent: string;
  github: { repo: string };
  linear: { team: string };
  /** "While you were away": shown on return after `awayMinutes` hidden or idle. */
  briefing: { enabled: boolean; awayMinutes: number };
}

export const DEFAULT_PREFS: Prefs = {
  onboarded: false,
  tracker: 'markdown',
  hitlTranscript: 'summary',
  agent: PRIMARY_AGENT.id,
  github: { repo: '' },
  linear: { team: '' },
  briefing: { enabled: true, awayMinutes: 15 },
};

export function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Live getter used by the engine so Settings changes reach running sessions. */
export const currentPrefs = () => loadPrefs();
