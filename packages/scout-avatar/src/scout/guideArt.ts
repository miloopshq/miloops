/**
 * Guide badges in a 200×200 box: one bold symbol for each speciality, in the same circle with hills as the logo and
 * Scout. Scout is the only character; Community is always the grey plus.
 */
const TONES = {
  reviewer: { ink: '#4a1f0c', fill: '#fbe3c8', accent: '#c8581e', sky: '#f6e3cf', mid: '#e8ab75', low: '#b9622f' },
  qa: { ink: '#123a22', fill: '#def4e0', accent: '#2f8a4e', sky: '#dcf0dc', mid: '#94cf9c', low: '#3f8f58' },
  security: { ink: '#123844', fill: '#d6ebf0', accent: '#22627a', sky: '#dcecf0', mid: '#8fbccb', low: '#3f7f95' },
  docs: { ink: '#3f3008', fill: '#fbf0c8', accent: '#c79a20', sky: '#f6edcc', mid: '#e6cd78', low: '#b08f2c' },
  architect: { ink: '#2a1c4a', fill: '#ebe3fa', accent: '#6a4bb0', sky: '#e6dff6', mid: '#b3a0e0', low: '#6f58ae' },
  community: { ink: '#2c3330', fill: '#eef0ec', accent: '#7d8680', sky: '#e6e9e4', mid: '#b9bfb8', low: '#7d8680' },
};
export type GuideRole = keyof typeof TONES;
type Tone = (typeof TONES)[GuideRole];

const SHIELD = 'M100 38l54 18v44q-2 40-54 62q-52-22-54-62V56z';

const SYMBOLS: Record<GuideRole, (c: Tone) => string> = {
  reviewer: (c) =>
    `<circle cx="88" cy="88" r="36" fill="${c.fill}" stroke="${c.ink}" stroke-width="13"/>` +
    `<path d="M114 114L150 150" stroke="${c.ink}" stroke-width="20" stroke-linecap="round"/>` +
    `<path d="M72 80q6-14 22-14" fill="none" stroke="${c.accent}" stroke-width="7" stroke-linecap="round"/>`,
  qa: (c) =>
    `<circle cx="100" cy="100" r="56" fill="${c.fill}" stroke="${c.ink}" stroke-width="13"/>` +
    `<path d="M74 102l18 20 36-42" fill="none" stroke="${c.accent}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`,
  security: (c) =>
    `<path d="${SHIELD}" fill="${c.fill}"/><path d="M100 52v96q40-18 42-50V64z" fill="${c.accent}"/>` +
    `<path d="${SHIELD}" fill="none" stroke="${c.ink}" stroke-width="13" stroke-linejoin="round"/>`,
  docs: (c) =>
    `<path d="M100 66C84 52 62 50 40 54V144C62 140 84 142 100 156C116 142 138 140 160 144V54C138 50 116 52 100 66Z" fill="${c.fill}" stroke="${c.ink}" stroke-width="13" stroke-linejoin="round"/>` +
    `<path d="M100 66V156" stroke="${c.ink}" stroke-width="11"/>` +
    `<path d="M58 80q14-2 26 4M58 104q14-2 26 4M116 84q12-6 26-4M116 108q12-6 26-4" fill="none" stroke="${c.accent}" stroke-width="7" stroke-linecap="round"/>`,
  architect: (c) =>
    `<path d="M100 60L64 152M100 60L136 152" fill="none" stroke="${c.ink}" stroke-width="22" stroke-linecap="round"/>` +
    `<path d="M100 60L64 152M100 60L136 152" fill="none" stroke="${c.fill}" stroke-width="8" stroke-linecap="round"/>` +
    `<path d="M74 122Q100 136 126 122" fill="none" stroke="${c.ink}" stroke-width="12" stroke-linecap="round"/>` +
    `<circle cx="100" cy="54" r="17" fill="${c.accent}" stroke="${c.ink}" stroke-width="11"/>`,
  community: (c) =>
    `<path d="M100 54V146M54 100H146" stroke="${c.ink}" stroke-width="32" stroke-linecap="round"/>` +
    `<path d="M100 54V146M54 100H146" stroke="${c.fill}" stroke-width="11" stroke-linecap="round"/>`,
};

let clipIds = 0;

export function guideMarkup(role: GuideRole) {
  const c = TONES[role];
  const id = `guide-${++clipIds}`;
  return [
    '<circle cx="100" cy="100" r="99" fill="var(--tt-keyline, transparent)"/>',
    `<clipPath id="${id}"><circle cx="100" cy="100" r="88"/></clipPath>`,
    `<g clip-path="url(#${id})"><rect width="200" height="200" fill="${c.sky}"/>`,
    `<path d="M0 108Q50 84 100 112T200 100V200H0z" fill="${c.mid}"/><path d="M0 150Q60 128 110 150T200 146V200H0z" fill="${c.low}"/>`,
    `<path d="M0 108Q50 84 100 112T200 100M0 150Q60 128 110 150T200 146" fill="none" stroke="${c.ink}" stroke-width="8"/></g>`,
    SYMBOLS[role](c),
    `<circle cx="100" cy="100" r="88" fill="none" stroke="${c.ink}" stroke-width="12"/>`,
  ].join('');
}
