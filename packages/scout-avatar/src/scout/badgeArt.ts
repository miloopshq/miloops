/**
 * Scout's badge in a 200×200 box: a CRT head in a ranger hat and neckerchief, in a circle with layered hills, drawn like
 * the Teamtrail logo. One function returns the SVG markup, so
 * <ScoutAvatar> and mountScout draw exactly the same thing.
 */
import type { Eye, Light, Mouth } from './types';

export interface BadgeColors {
  ink: string;
  shell: string;
  edge: string;
  glass: string;
  glow: string;
  hat: string;
  band: string;
  kerchief: string;
  sky: string;
  mid: string;
  low: string;
}

const SCOUT: BadgeColors = {
  ink: '#16302a',
  shell: '#eae3cf',
  edge: '#c8bea2',
  glass: '#16302a',
  glow: '#b4e8c0',
  hat: '#8a5a38',
  band: '#e6dcc0',
  kerchief: '#c8581e',
  sky: '#d9e4d2',
  mid: '#7fa888',
  low: '#3f6b45',
};

export interface BadgeLamp {
  on: string;
  dim: string;
  alert: string;
}

export const LAMP_DAY: BadgeLamp = { on: '#e2711d', dim: '#a8501c', alert: '#ff5a48' };
/** At night the same Scout's hat lamp burns bright. */
export const LAMP_NIGHT: BadgeLamp = { on: '#ffd166', dim: '#a8501c', alert: '#ff5a48' };

export interface BadgeFace {
  eyes: Eye;
  mouth: Mouth;
  light?: Light;
}

const line = (d: string, color: string, width: number) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;

function eyesMarkup(eyes: Eye, c: string) {
  if (eyes === 'closed') return line('M80 124h12M108 124h12', c, 5.5);
  if (eyes === 'aside') return line('M86 124q6-8 12 0M114 124q6-8 12 0', c, 5.5);
  if (eyes === 'wide')
    return `<circle cx="86" cy="122" r="6.5" fill="${c}"/><circle cx="114" cy="122" r="6.5" fill="${c}"/>`;
  return line('M80 124q6-8 12 0M108 124q6-8 12 0', c, 5.5);
}

function mouthMarkup(mouth: Mouth, c: string) {
  if (mouth === 'open') return `<ellipse cx="100" cy="138" rx="7" ry="5" fill="${c}"/>`;
  if (mouth === 'mid') return line('M92 138h16', c, 5);
  if (mouth === 'aside') return line('M104 138q7 2 13-2', c, 5);
  return line('M92 136q8 6 16 0', c, 5);
}

function headMarkup({ eyes, mouth, light = 'on' }: BadgeFace, lamp: BadgeLamp) {
  const c = SCOUT;
  const outline = `stroke="${c.ink}" stroke-width="6.5" stroke-linejoin="round"`;
  return [
    `<path d="M54 94V146A16 16 0 0 0 70 162H130A16 16 0 0 0 146 146V94Z" fill="${c.shell}" stroke="${c.ink}" stroke-width="8" stroke-linejoin="round"/>`,
    `<path d="M58 142H142V146A12 12 0 0 1 130 158H70A12 12 0 0 1 58 146Z" fill="${c.edge}"/>`,
    `<rect x="66" y="104" width="68" height="46" rx="8" fill="${c.glass}"/>`,
    `<path d="M100 170L82 162H118Z" fill="${c.kerchief}" stroke="${c.ink}" stroke-width="5" stroke-linejoin="round"/>`,
    eyesMarkup(eyes, c.glow),
    mouthMarkup(mouth, c.glow),
    `<path d="M70 94L76 56Q90 50 100 44Q110 50 124 56L130 94Z" fill="${c.hat}" ${outline}/>`,
    `<path d="M71 82H129V94H71Z" fill="${c.band}" stroke="${c.ink}" stroke-width="4"/>`,
    `<path d="M34 98Q100 82 166 98Q100 114 34 98Z" fill="${c.hat}" ${outline}/>`,
    `<path d="M100 52l6 9h-3l5 8H92l5-8h-3z" fill="${c.band}"/>`,
    `<rect x="113" y="83" width="10" height="10" rx="2" fill="${lamp[light]}" stroke="${c.ink}" stroke-width="3"/>`,
  ].join('');
}

let clipIds = 0;

/** The full badge. `simple` drops the hills and fine detail for sizes under about 28px. */
export function badgeMarkup(
  face: BadgeFace,
  { lamp = LAMP_DAY, simple = false }: { lamp?: BadgeLamp; simple?: boolean } = {},
) {
  const c = SCOUT;
  const id = `scout-badge-${++clipIds}`;
  const hills = simple
    ? ''
    : `<path d="M0 108Q50 84 100 112T200 100V200H0z" fill="${c.mid}"/><path d="M0 150Q60 128 110 150T200 146V200H0z" fill="${c.low}"/>` +
      `<path d="M0 108Q50 84 100 112T200 100M0 150Q60 128 110 150T200 146" fill="none" stroke="${c.ink}" stroke-width="8"/>`;
  const place = simple
    ? 'translate(100 94) scale(1.28) translate(-100 -108)'
    : 'translate(100 100) scale(1.12) translate(-100 -108)';
  return [
    '<circle cx="100" cy="100" r="99" fill="var(--tt-keyline, transparent)"/>',
    `<clipPath id="${id}"><circle cx="100" cy="100" r="88"/></clipPath>`,
    `<g clip-path="url(#${id})"><rect width="200" height="200" fill="${simple ? c.mid : c.sky}"/>${hills}</g>`,
    `<g transform="${place}">${headMarkup(simple ? { eyes: 'wide', mouth: 'rest', light: face.light } : face, lamp)}</g>`,
    `<circle cx="100" cy="100" r="88" fill="none" stroke="${c.ink}" stroke-width="${simple ? 16 : 12}"/>`,
  ].join('');
}
