import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  EXPRESSIONS,
  RECOMMENDED_STYLE,
  STATUS_LABEL,
  STYLES,
  TIMING,
  composeFrame,
  composeWave,
  viseme,
  type Eye,
  type Light,
  type MiloState,
  type MiloStyleId,
  type Mouth,
  type Palette,
} from './frames';
import './MiloAvatar.css';

export type MiloSize = 'xs' | 'sm' | 'md' | 'lg';

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

/** Screen px per pixel of the 32px head; the 16px xs head gets double. */
const SCALE: Record<MiloSize, number> = { xs: 1, sm: 3, md: 5, lg: 7 };
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(REDUCED_QUERY);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** ms since `key` changed, re-rendering at most every `stepMs` while `running`. */
function useClock(key: string, running: boolean, stepMs: number): number {
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

function useBlink(enabled: boolean): boolean {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!enabled) { setClosed(false); return; }
    let open: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      setClosed(true);
      open = setTimeout(() => setClosed(false), TIMING.blinkMs);
    }, TIMING.blinkEveryMs);
    return () => { clearInterval(id); if (open) clearTimeout(open); };
  }, [enabled]);
  return closed;
}

/** Pixel rows -> one crisp SVG, merging horizontal runs of the same color into single rects. */
export function Sprite({ rows, palette, scale, className }: { rows: string[]; palette: Palette; scale: number; className?: string }) {
  const w = rows[0]?.length ?? 0;
  const h = rows.length;
  const rects: JSX.Element[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === key) end++;
      const fill = palette[key];
      if (fill) rects.push(<rect key={`${y}-${x}`} x={x} y={y} width={end - x} height={1} fill={fill} />);
      x = end;
    }
  });
  return (
    <svg className={className} width={w * scale} height={h * scale} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden="true">
      {rects}
    </svg>
  );
}

function Wave({ heights, bars, unit, colors }: { heights: number[] | null; bars: number; unit: number; colors: { bar: string; lead: string } }) {
  const width = bars * 2;
  return (
    <svg className={`milo-wave${heights ? ' on' : ''}`} width={width * unit} height={3.5 * unit} viewBox={`0 0 ${width} 3.5`} shapeRendering="crispEdges" aria-hidden="true">
      {heights?.map((amp, i) => {
        const hh = (1 + 2 * amp) * 0.5;
        return <rect key={i} x={i * 2} y={(3.5 - hh) / 2} width={1} height={hh} fill={i >= bars - 2 && amp > 0 ? colors.lead : colors.bar} />;
      })}
    </svg>
  );
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
  const prefersReduced = usePrefersReducedMotion();
  const reduced = prefersReduced || size === 'xs';
  const style = STYLES[variant];
  const mini = size === 'xs';
  const art = mini ? style.mini : style.art;
  const text = speaking?.trim() ?? '';
  const effective: MiloState = text && (state === 'idle' || state === 'speaking') ? 'speaking' : state;
  const talking = effective === 'speaking' && text.length > 0;
  const isFramed = framed ?? !mini;
  const frozen = at !== undefined;
  const animate = !reduced && !frozen;
  const key = `${effective}|${variant}|${text}`;
  const speechMs = text.length * TIMING.msPerChar;

  const [doneKey, setDoneKey] = useState('');
  const endRef = useRef(onSpeakEnd);
  endRef.current = onSpeakEnd;
  useEffect(() => {
    if (!talking || frozen) return;
    const id = setTimeout(() => { setDoneKey(key); endRef.current?.(); }, speechMs + 350);
    return () => clearTimeout(id);
  }, [talking, key, speechMs, frozen]);

  const speechRunning = talking && doneKey !== key;
  const clock = useClock(key, animate && (speechRunning || effective === 'thinking'), speechRunning ? 40 : TIMING.thinkingStepMs);
  const t = at ?? clock;
  const speechDone = talking && (frozen ? t >= speechMs : doneKey === key);
  const blinking = useBlink(animate && isFramed && (effective === 'idle' || effective === 'speaking'));

  const expr = EXPRESSIONS[effective];
  const eyes: Eye = blinking ? 'closed' : expr.eyes;
  let mouth: Mouth = expr.mouth;
  let cursor = text.length - 1;
  if (talking && !speechDone) {
    if (reduced) mouth = 'open';
    else {
      cursor = Math.min(text.length - 1, Math.floor(t / TIMING.msPerChar));
      const held = Math.floor(t / TIMING.mouthHoldMs) * Math.round(TIMING.mouthHoldMs / TIMING.msPerChar);
      mouth = viseme(text[Math.min(text.length - 1, held)]);
    }
  }

  let light: Light = expr.light;
  if (effective === 'thinking' && !reduced && Math.floor(t / TIMING.thinkingStepMs) % 2 === 1) light = 'on';

  const rows = useMemo(() => composeFrame(art, { eyes, mouth, light }), [art, eyes, mouth, light]);
  const spriteW = rows[0]?.length ?? 32;
  const base = typeof size === 'number' ? size : SCALE[size];
  const scale = base * (mini ? 2 : 32 / spriteW);
  const showWave = talking && !speechDone;
  const bars = Math.floor((spriteW * scale) / (2 * base));
  const waveCursor = reduced ? Math.min(text.length - 1, bars - 1) : cursor;
  const wave = useMemo(() => (showWave ? composeWave(text, waveCursor, bars) : null), [showWave, text, waveCursor, bars]);

  const showCaption = caption ?? (size === 'md' || size === 'lg' || (typeof size === 'number' && size >= 4));
  const shown = talking ? (reduced || speechDone ? text : text.slice(0, cursor + 1)) : '';
  const shownState: MiloState = talking && speechDone ? 'idle' : effective;
  const status = STATUS_LABEL[shownState];
  const ariaLabel = `${label}, ${status.toLowerCase()}`;
  const cssVars = { ...styleProp, ['--milo-scale' as string]: `${scale}px`, ['--milo-u' as string]: `${base}px` } as CSSProperties;

  const sprite = (
    <span className="milo-sprite">
      <Sprite rows={rows} palette={style.palette} scale={scale} />
    </span>
  );

  if (!isFramed) {
    return (
      <span className={`milo milo-bare milo-${shownState} ${className ?? ''}`} style={cssVars} role="img" aria-label={ariaLabel}>
        {sprite}
      </span>
    );
  }

  return (
    <figure className={`milo milo-panel milo-${shownState} milo-v-${variant} ${className ?? ''}`} style={cssVars} data-state={shownState}>
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
      {text && <span className="milo-sr" aria-live="polite">{text}</span>}
    </figure>
  );
}

export default MiloAvatar;
