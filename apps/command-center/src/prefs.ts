import { useCallback, useState } from 'react';
import { PREFS_KEY, PRIMARY_AGENT, type HitlTranscriptMode } from '@miloops-hq/core';

export type TrackerChoice = 'markdown' | 'demo';

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

export function usePrefs() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  return [prefs, update] as const;
}
