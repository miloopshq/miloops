/**
 * What MILO shows at a moment, shared by <MiloAvatar> and mountMilo so both renderers draw the same frame.
 */
import { EXPRESSIONS, STATUS_LABEL, TIMING, viseme } from './frames';
import type { Eye, Light, MiloSize, MiloState, Mouth } from './types';

/** Screen px per pixel of the 32px head; the 16px xs head gets double. */
const SCALE: Record<MiloSize, number> = { xs: 1, sm: 3, md: 5, lg: 7 };
export const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
/** Re-render step while a line is spoken. */
export const SPEECH_STEP_MS = 40;
/** Pause after the last character before the line counts as played out. */
export const SPEECH_TAIL_MS = 350;

export interface MiloInput {
  state?: MiloState;
  size?: MiloSize | number;
  speaking?: string;
  framed?: boolean;
}

export type ResolvedMilo = ReturnType<typeof resolveMilo>;

/** A `speaking` line implies the speaking state unless MILO is alert or thinking. xs never animates. */
export function resolveMilo(o: MiloInput, prefersReduced: boolean) {
  const size = o.size ?? 'md';
  const state = o.state ?? 'idle';
  const text = o.speaking?.trim() ?? '';
  const effective: MiloState = text && (state === 'idle' || state === 'speaking') ? 'speaking' : state;
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
export const blinks = (m: ResolvedMilo, animate: boolean) =>
  animate && (m.effective === 'idle' || m.effective === 'speaking' || m.effective === 'alert');

/** Eyes, mouth and status light `t` ms into the current state, and the index of the character being spoken. */
export function miloFace(m: ResolvedMilo, t: number, blinking: boolean, speaking: boolean) {
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

/** Sprite scale, the screen unit and the number of waveform bars that fit under the sprite. */
export function miloLayout(rows: string[], m: ResolvedMilo, cursor: number) {
  const spriteW = rows[0]?.length ?? 32;
  const base = typeof m.size === 'number' ? m.size : SCALE[m.size];
  const scale = base * (m.mini ? 2 : 32 / spriteW);
  const bars = Math.floor((spriteW * scale) / (2 * base));
  const waveCursor = m.reduced ? Math.min(m.text.length - 1, bars - 1) : cursor;
  return { base, scale, bars, waveCursor };
}

/** Status shown in the panel head, the accessible label and the caption text. */
export function miloLabels(m: ResolvedMilo, label: string, speechDone: boolean, cursor: number, caption?: boolean) {
  const shownState: MiloState = m.talking && speechDone ? 'idle' : m.effective;
  const status = STATUS_LABEL[shownState];
  return {
    shownState,
    status,
    ariaLabel: `${label}, ${status.toLowerCase()}`,
    showCaption: caption ?? (m.size === 'md' || m.size === 'lg' || (typeof m.size === 'number' && m.size >= 4)),
    shown: m.talking ? (m.reduced || speechDone ? m.text : m.text.slice(0, cursor + 1)) : '',
  };
}
