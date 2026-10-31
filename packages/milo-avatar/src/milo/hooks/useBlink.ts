import { useEffect, useState } from 'react';
import { TIMING } from '../frames';

export function useBlink(enabled: boolean): boolean {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setClosed(false);
      return;
    }
    let open: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      setClosed(true);
      open = setTimeout(() => setClosed(false), TIMING.blinkMs);
    }, TIMING.blinkEveryMs);
    return () => {
      clearInterval(id);
      if (open) clearTimeout(open);
    };
  }, [enabled]);
  return closed;
}
