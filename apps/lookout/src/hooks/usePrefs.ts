import { PREFS_KEY } from '@teamtrail/core';
import { useState, useCallback } from 'react';
import { loadPrefs, type Prefs } from '../lib';

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
