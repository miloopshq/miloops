let clipIds = 0;

const INK = '#16302a';
const HEAD = (face: string) =>
  `<rect x="54" y="88" width="92" height="72" rx="16" fill="#f1e8d3" stroke="${INK}" stroke-width="8"/>` +
  `<rect x="66" y="100" width="68" height="48" rx="8" fill="${INK}"/>${face}`;
const FACE =
  '<path d="M78 124q6-8 12 0M110 124q6-8 12 0" fill="none" stroke="#b4e8c0" stroke-width="5.5" stroke-linecap="round"/>' +
  '<path d="M90 134q10 7 20 0" fill="none" stroke="#b4e8c0" stroke-width="5" stroke-linecap="round"/>';
const SIMPLE_FACE = '<circle cx="84" cy="122" r="7" fill="#b4e8c0"/><circle cx="116" cy="122" r="7" fill="#b4e8c0"/>';
const SPROUT =
  `<path d="M100 90V70" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>` +
  `<path d="M100 80C84 80 70 68 68 48C88 48 100 60 100 80Z" fill="#3f6b45" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
  `<path d="M100 72C114 72 128 62 130 44C112 44 100 54 100 72Z" fill="#7fa888" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
const HILLS =
  '<path d="M0 108Q50 84 100 112T200 100V200H0z" fill="#7fa888"/><path d="M0 150Q60 128 110 150T200 146V200H0z" fill="#3f6b45"/>' +
  `<path d="M0 108Q50 84 100 112T200 100M0 150Q60 128 110 150T200 146" fill="none" stroke="${INK}" stroke-width="8"/>`;

/**
 * The Teamtrail logo in a 200×200 box: a CRT screen with a sapling growing from it, in a circle with layered hills.
 * `simple` is the favicon drawing, without the hills. `--tt-keyline` puts a cream edge around it on dark backgrounds.
 */
export function logoMarkup({ simple = false }: { simple?: boolean } = {}) {
  const id = `tt-logo-${++clipIds}`;
  const mark = simple
    ? `<g transform="translate(100 98) scale(1.42) translate(-100 -104)">${SPROUT}${HEAD(SIMPLE_FACE)}</g>`
    : `<g transform="translate(100 102) scale(1.22) translate(-100 -104)">${SPROUT}${HEAD(FACE)}</g>`;
  return [
    '<circle cx="100" cy="100" r="99" fill="var(--tt-keyline, transparent)"/>',
    `<clipPath id="${id}"><circle cx="100" cy="100" r="88"/></clipPath>`,
    `<g clip-path="url(#${id})"><rect width="200" height="200" fill="#d9e4d2"/>${simple ? '' : HILLS}</g>`,
    mark,
    `<circle cx="100" cy="100" r="88" fill="none" stroke="${INK}" stroke-width="${simple ? 16 : 12}"/>`,
  ].join('');
}
