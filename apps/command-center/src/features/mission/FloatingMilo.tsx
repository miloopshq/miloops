import { MiloAvatar } from '@miloops-hq/milo-avatar';
import { useEffect, useState } from 'react';

const LINES = [
  'Ready when you are',
  "What's the next big idea?",
  'I keep the crew on track',
  'Describe it, I frame it',
];
const REST_MS = 5000;

/** The empty map's MILO: floating, blinking, saying a short line every few seconds. */
export function FloatingMilo() {
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
    <div className="floating-milo" aria-hidden="true">
      <MiloAvatar
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
