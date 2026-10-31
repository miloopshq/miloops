import { spriteRects, WAVE_HEIGHT, waveRects, waveWidth, type Rect } from './rects';
import type { Palette } from './types';

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

export function drawSprite(svg: SVGElement, rows: string[], palette: Palette, scale: number) {
  const w = rows[0]?.length ?? 0;
  const h = rows.length;
  svg.setAttribute('width', String(w * scale));
  svg.setAttribute('height', String(h * scale));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  drawRects(svg, spriteRects(rows, palette));
}

export function drawWave(
  svg: SVGElement,
  heights: number[] | null,
  bars: number,
  unit: number,
  colors: { bar: string; lead: string },
) {
  const width = waveWidth(bars);
  svg.setAttribute('class', `milo-wave${heights ? ' on' : ''}`);
  svg.setAttribute('width', String(width * unit));
  svg.setAttribute('height', String(WAVE_HEIGHT * unit));
  svg.setAttribute('viewBox', `0 0 ${width} ${WAVE_HEIGHT}`);
  drawRects(svg, waveRects(heights, bars, colors));
}

export function caret() {
  const node = document.createElement('span');
  node.className = 'milo-caret';
  node.textContent = '_';
  return node;
}

/** The elements of a MILO panel, with the same classes as <MiloAvatar>; `root` is attached to `host`. */
export function createMiloDom(host: HTMLElement) {
  const root = document.createElement('figure');
  const head = document.createElement('figcaption');
  const name = document.createElement('span');
  const sep = document.createElement('span');
  const status = document.createElement('span');
  const feed = document.createElement('div');
  const spriteWrap = document.createElement('span');
  const sprite = svgEl('svg', { 'shape-rendering': 'crispEdges', 'aria-hidden': 'true' });
  const wave = svgEl('svg', { 'shape-rendering': 'crispEdges', 'aria-hidden': 'true' });
  const caption = document.createElement('p');
  const live = document.createElement('span');
  head.className = 'milo-head';
  name.className = 'milo-name';
  sep.className = 'milo-sep';
  sep.textContent = '//';
  status.className = 'milo-status';
  feed.className = 'milo-feed';
  feed.setAttribute('role', 'img');
  spriteWrap.className = 'milo-sprite';
  caption.className = 'milo-caption';
  caption.setAttribute('aria-hidden', 'true');
  live.className = 'milo-sr';
  live.setAttribute('aria-live', 'polite');
  head.append(name, sep, status);
  spriteWrap.append(sprite);
  host.replaceChildren(root);
  return { root, head, name, status, feed, spriteWrap, sprite, wave, caption, live };
}
