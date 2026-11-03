import { useEffect, useRef, useState } from 'react';
import { TIMING } from '../frames';
import { SPEECH_STEP_MS, SPEECH_TAIL_MS, speechDuration } from '../miloFrame';
import { useClock } from './useClock';

/**
 * The avatar's clock: it ticks while MILO speaks or thinks, and says when the current line is spoken.
 * `at` freezes it at a fixed time (screenshots); `key` restarts it when the state, style or text changes.
 */
export function useSpeechClock(opts: {
  key: string;
  text: string;
  talking: boolean;
  thinking: boolean;
  animate: boolean;
  at?: number;
  onSpeakEnd?: () => void;
}) {
  const { key, talking, at } = opts;
  const frozen = at !== undefined;
  const speechMs = speechDuration(opts.text);
  const [doneKey, setDoneKey] = useState('');
  const endRef = useRef(opts.onSpeakEnd);
  endRef.current = opts.onSpeakEnd;
  useEffect(() => {
    if (!talking || frozen) return;
    const id = setTimeout(() => {
      setDoneKey(key);
      endRef.current?.();
    }, speechMs + SPEECH_TAIL_MS);
    return () => clearTimeout(id);
  }, [talking, key, speechMs, frozen]);

  const speechRunning = talking && doneKey !== key;
  const clock = useClock(
    key,
    opts.animate && (speechRunning || opts.thinking),
    speechRunning ? SPEECH_STEP_MS : TIMING.thinkingStepMs,
  );
  const t = at ?? clock;
  const speechDone = talking && (frozen ? t >= speechMs : doneKey === key);
  return { t, speechDone };
}
