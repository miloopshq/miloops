import { MiloAvatar } from '@miloops-hq/milo-avatar';
import { useEffect, useState } from 'react';
import { useNight } from '../../hooks';

const LINES = ['Standing by', 'Watching the mission', 'Agents on the line', 'Ready when you are'];
const REST_MS = 6000;

/** The header mark: the detailed MILO, idling (blinking) and saying a short line every few seconds, on a loop. */
export function HeaderMilo() {
  const night = useNight();
  const [i, setI] = useState(0);
  const [talking, setTalking] = useState(true);
  useEffect(() => {
    if (talking) return;
    const id = setTimeout(() => {
      setI((n) => (n + 1) % LINES.length);
      setTalking(true);
    }, REST_MS);
    return () => clearTimeout(id);
  }, [talking]);
  return (
    <MiloAvatar
      size={1}
      variant={night ? 'night' : 'crt'}
      framed={false}
      speaking={talking ? LINES[i] : undefined}
      onSpeakEnd={() => setTalking(false)}
      label="MILO"
      className="h-milo"
    />
  );
}
