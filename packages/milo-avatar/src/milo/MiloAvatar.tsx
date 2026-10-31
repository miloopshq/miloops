import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { RECOMMENDED_STYLE, STYLES, TIMING, composeFrame, composeWave } from './frames';
import { useBlink } from './hooks/useBlink';
import { useClock } from './hooks/useClock';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';
import {
  blinks,
  miloFace,
  miloLabels,
  miloLayout,
  resolveMilo,
  SPEECH_STEP_MS,
  SPEECH_TAIL_MS,
  speechDuration,
} from './miloFrame';
import { Sprite } from './Sprite';
import type { MiloSize, MiloState, MiloStyleId } from './types';
import { Wave } from './Wave';
import './MiloAvatar.css';

export type { MiloSize } from './types';

export interface MiloAvatarProps {
  state?: MiloState;
  /** xs: 32px inline head (16px sprite at 2x); sm/md/lg: framed 32px head at 3/5/7x. A number sets the screen px per sprite pixel. */
  size?: MiloSize | number;
  /** Line MILO is saying. Drives mouth, waveform and caption; implies `state="speaking"` unless the state is alert or thinking. */
  speaking?: string;
  variant?: MiloStyleId;
  /** Draw the HUD panel frame and label. Defaults to true except for `xs`. */
  framed?: boolean;
  /** Show the spoken line under the waveform. Defaults to true for md and lg. */
  caption?: boolean;
  label?: string;
  /** Fires once the `speaking` line has played out (also under reduced motion, after the same duration). */
  onSpeakEnd?: () => void;
  /** Freeze the clock at this many ms into the current state (previews, screenshots, tests). */
  at?: number;
  className?: string;
  style?: CSSProperties;
}

export function MiloAvatar({
  state = 'idle',
  size = 'md',
  speaking,
  variant = RECOMMENDED_STYLE,
  framed,
  caption,
  label = 'MILO',
  onSpeakEnd,
  at,
  className,
  style: styleProp,
}: MiloAvatarProps) {
  const m = resolveMilo({ state, size, speaking, framed }, usePrefersReducedMotion());
  const { text, effective, talking, reduced } = m;
  const style = STYLES[variant];
  const art = m.mini ? style.mini : style.art;
  const frozen = at !== undefined;
  const animate = !reduced && !frozen;
  const key = `${effective}|${variant}|${text}`;
  const speechMs = speechDuration(text);

  const [doneKey, setDoneKey] = useState('');
  const endRef = useRef(onSpeakEnd);
  endRef.current = onSpeakEnd;
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
    animate && (speechRunning || effective === 'thinking'),
    speechRunning ? SPEECH_STEP_MS : TIMING.thinkingStepMs,
  );
  const t = at ?? clock;
  const speechDone = talking && (frozen ? t >= speechMs : doneKey === key);
  const blinking = useBlink(blinks(m, animate));

  const showWave = talking && !speechDone;
  const { eyes, mouth, light, cursor } = miloFace(m, t, blinking, showWave);
  const rows = useMemo(() => composeFrame(art, { eyes, mouth, light }), [art, eyes, mouth, light]);
  const { base, scale, bars, waveCursor } = miloLayout(rows, m, cursor);
  const wave = useMemo(
    () => (showWave ? composeWave(text, waveCursor, bars) : null),
    [showWave, text, waveCursor, bars],
  );

  const { shownState, status, ariaLabel, showCaption, shown } = miloLabels(m, label, speechDone, cursor, caption);
  const cssVars = {
    ...styleProp,
    ['--milo-scale' as string]: `${scale}px`,
    ['--milo-u' as string]: `${base}px`,
  } as CSSProperties;

  const sprite = (
    <span className="milo-sprite">
      <Sprite rows={rows} palette={style.palette} scale={scale} />
    </span>
  );

  if (!m.framed) {
    return (
      <span
        className={`milo milo-bare milo-${shownState} ${className ?? ''}`}
        style={cssVars}
        role="img"
        aria-label={ariaLabel}
      >
        {sprite}
      </span>
    );
  }

  return (
    <figure
      className={`milo milo-panel milo-${shownState} milo-v-${variant} ${className ?? ''}`}
      style={cssVars}
      data-state={shownState}
    >
      <figcaption className="milo-head">
        <span className="milo-name">{label}</span>
        <span className="milo-sep">//</span>
        <span className="milo-status">{status}</span>
      </figcaption>
      <div className="milo-feed" role="img" aria-label={ariaLabel}>
        {sprite}
        <Wave heights={wave} bars={bars} unit={base} colors={style.wave} />
      </div>
      {showCaption && (
        <p className="milo-caption" aria-hidden="true">
          {shown}
          {talking && !speechDone && !reduced && <span className="milo-caret">_</span>}
        </p>
      )}
      {text && (
        <span className="milo-sr" aria-live="polite">
          {text}
        </span>
      )}
    </figure>
  );
}

export default MiloAvatar;
