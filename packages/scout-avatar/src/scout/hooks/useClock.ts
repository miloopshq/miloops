import { useEffect, useState } from 'react';

/** ms since `key` changed, re-rendering at most every `stepMs` while `running`. */
export function useClock(key: string, running: boolean, stepMs: number): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    setT(0);
    if (!running) return;
    const start = performance.now();
    const id = setInterval(() => setT(performance.now() - start), stepMs);
    return () => clearInterval(id);
  }, [key, running, stepMs]);
  return t;
}
