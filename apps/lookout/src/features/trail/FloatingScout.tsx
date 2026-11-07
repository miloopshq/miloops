import { ScoutAvatar } from '@teamtrail/scout-avatar';
import { useEffect, useState } from 'react';
import { useNight } from '../../hooks';

const LINES = [
  'Ready when you are',
  "What's the next big idea?",
  'I keep the party on the trail',
  'Describe it, I frame it',
];
const REST_MS = 5000;

/** The empty map's Scout: floating, blinking, saying a short line every few seconds. */
export function FloatingScout() {
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
    <div className="floating-scout" aria-hidden="true">
      <ScoutAvatar
        variant={night ? 'night' : 'crt'}
        size={3}
        framed={false}
        speaking={talking ? LINES[i] : undefined}
        onSpeakEnd={() => setTalking(false)}
        className="fm-avatar"
      />
      <span className="fm-shadow" />
    </div>
  );
}
