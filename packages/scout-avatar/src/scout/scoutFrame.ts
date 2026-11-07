/**
 * What Scout shows at a moment, shared by <ScoutAvatar> and mountScout so both renderers draw the same frame.
 */
import { EXPRESSIONS, STATUS_LABEL, TIMING, viseme } from './frames';
import type { Eye, Light, ScoutSize, ScoutState, Mouth } from './types';

/** A size is a unit of the 40-unit badge; xs is a fixed 32px with the simple drawing. */
const SCALE: Record<ScoutSize, number> = { xs: 0.8, sm: 2, md: 4, lg: 6 };
const BADGE_UNITS = 40;
const WAVE_BARS = 20;
export const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
/** Re-render step while a line is spoken. */
export const SPEECH_STEP_MS = 40;
/** Pause after the last character before the line counts as played out. */
export const SPEECH_TAIL_MS = 350;

export interface ScoutInput {
  state?: ScoutState;
  size?: ScoutSize | number;
  speaking?: string;
  framed?: boolean;
}

export type ResolvedScout = ReturnType<typeof resolveScout>;

/** A `speaking` line implies the speaking state unless Scout is alert or thinking. xs never animates. */
export function resolveScout(o: ScoutInput, prefersReduced: boolean) {
  const size = o.size ?? 'md';
  const state = o.state ?? 'idle';
  const text = o.speaking?.trim() ?? '';
  const effective: ScoutState = text && (state === 'idle' || state === 'speaking') ? 'speaking' : state;
  const mini = size === 'xs';
  return {
    size,
    text,
    effective,
    talking: effective === 'speaking' && text.length > 0,
    mini,
    framed: o.framed ?? !mini,
    reduced: prefersReduced || mini,
  };
}

export const speechDuration = (text: string) => text.length * TIMING.msPerChar;

/** Idle and speaking heads blink, when animated and framed. */
/** Blinks while idle, speaking or waiting on a decision (alert), framed or bare; xs never animates. */
export const blinks = (m: ResolvedScout, animate: boolean) =>
  animate && (m.effective === 'idle' || m.effective === 'speaking' || m.effective === 'alert');

/** Eyes, mouth and status light `t` ms into the current state, and the index of the character being spoken. */
export function scoutFace(m: ResolvedScout, t: number, blinking: boolean, speaking: boolean) {
  const expr = EXPRESSIONS[m.effective];
  const eyes: Eye = blinking ? 'closed' : expr.eyes;
  let mouth: Mouth = expr.mouth;
  let cursor = m.text.length - 1;
  if (speaking) {
    if (m.reduced) mouth = 'open';
    else {
      cursor = Math.min(m.text.length - 1, Math.floor(t / TIMING.msPerChar));
      const held = Math.floor(t / TIMING.mouthHoldMs) * Math.round(TIMING.mouthHoldMs / TIMING.msPerChar);
      mouth = viseme(m.text[Math.min(m.text.length - 1, held)]);
    }
  }
  let light: Light = expr.light;
  if (m.effective === 'thinking' && !m.reduced && Math.floor(t / TIMING.thinkingStepMs) % 2 === 1) light = 'on';
  return { eyes, mouth, light, cursor };
}

/** The badge's size in px, the screen unit and the waveform's cursor. */
export function scoutLayout(m: ResolvedScout, cursor: number) {
  const base = typeof m.size === 'number' ? m.size : SCALE[m.size];
  const waveCursor = m.reduced ? Math.min(m.text.length - 1, WAVE_BARS - 1) : cursor;
  return { base, px: BADGE_UNITS * base, bars: WAVE_BARS, waveCursor };
}

/** Status shown in the panel head, the accessible label and the caption text. */
export function scoutLabels(
  m: ResolvedScout,
  { label, speechDone, cursor, caption }: { label: string; speechDone: boolean; cursor: number; caption?: boolean },
) {
  const shownState: ScoutState = m.talking && speechDone ? 'idle' : m.effective;
  const status = STATUS_LABEL[shownState];
  const bigEnough = m.size === 'md' || m.size === 'lg' || (typeof m.size === 'number' && m.size >= 4);
  return {
    shownState,
    status,
    ariaLabel: `${label}, ${status.toLowerCase()}`,
    showCaption: caption ?? bigEnough,
    shown: spokenSoFar(m, speechDone, cursor),
  };
}

/** The caption types out with the speech; reduced motion or finished speech shows it whole. */
function spokenSoFar(m: ResolvedScout, speechDone: boolean, cursor: number) {
  if (!m.talking) return '';
  if (m.reduced || speechDone) return m.text;
  return m.text.slice(0, cursor + 1);
}
