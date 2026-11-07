import { WAVE_HEIGHT, waveRects, waveWidth, type Rect } from './rects';

const SVG = 'http://www.w3.org/2000/svg';

function svgEl(name: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function drawRects(svg: SVGElement, rects: Rect[]) {
  svg.replaceChildren();
  for (const r of rects) svg.appendChild(svgEl('rect', { ...r }));
}

export function drawBadge(svg: SVGElement, markup: string, size: number) {
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 200 200');
  svg.innerHTML = markup;
}

export function drawWave(
  svg: SVGElement,
  {
    heights,
    bars,
    unit,
    colors,
  }: { heights: number[] | null; bars: number; unit: number; colors: { bar: string; lead: string } },
) {
  const width = waveWidth(bars);
  svg.setAttribute('class', `scout-wave${heights ? ' on' : ''}`);
  svg.setAttribute('width', String(width * unit));
  svg.setAttribute('height', String(WAVE_HEIGHT * unit));
  svg.setAttribute('viewBox', `0 0 ${width} ${WAVE_HEIGHT}`);
  drawRects(svg, waveRects(heights, bars, colors));
}

export function caret() {
  const node = document.createElement('span');
  node.className = 'scout-caret';
  node.textContent = '_';
  return node;
}

/** The elements of a Scout panel, with the same classes as <ScoutAvatar>; `root` is attached to `host`. */
export function createScoutDom(host: HTMLElement) {
  const root = document.createElement('figure');
  const head = document.createElement('figcaption');
  const name = document.createElement('span');
  const sep = document.createElement('span');
  const status = document.createElement('span');
  const feed = document.createElement('div');
  const spriteWrap = document.createElement('span');
  const sprite = svgEl('svg', { 'aria-hidden': 'true' });
  const wave = svgEl('svg', { 'aria-hidden': 'true' });
  const caption = document.createElement('p');
  const live = document.createElement('span');
  head.className = 'scout-head';
  name.className = 'scout-name';
  sep.className = 'scout-sep';
  sep.textContent = '//';
  status.className = 'scout-status';
  feed.className = 'scout-feed';
  feed.setAttribute('role', 'img');
  spriteWrap.className = 'scout-sprite';
  caption.className = 'scout-caption';
  caption.setAttribute('aria-hidden', 'true');
  live.className = 'scout-sr';
  live.setAttribute('aria-live', 'polite');
  head.append(name, sep, status);
  spriteWrap.append(sprite);
  host.replaceChildren(root);
  return { root, head, name, status, feed, spriteWrap, sprite, wave, caption, live };
}
