/**
 * Framework-free MILO renderer for non-React pages. Same frames, timing, markup and CSS classes as <MiloAvatar>.
 */
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

export interface MountMiloOptions {
  state?: MiloState;
  size?: MiloSize | number;
  speaking?: string;
  variant?: MiloStyleId;
  framed?: boolean;
  caption?: boolean;
  label?: string;
  onSpeakEnd?: () => void;
}

export interface MiloHandle {
  update(next: Partial<MountMiloOptions>): void;
  destroy(): void;
}

const SCALE: Record<MiloSize, number> = { xs: 1, sm: 3, md: 5, lg: 7 };
const SVG = 'http://www.w3.org/2000/svg';
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function svgEl(name: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function drawSprite(svg: SVGElement, rows: string[], palette: Palette, scale: number) {
  const w = rows[0]?.length ?? 0;
  const h = rows.length;
  svg.setAttribute('width', String(w * scale));
  svg.setAttribute('height', String(h * scale));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.replaceChildren();
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === key) end++;
      const fill = palette[key];
      if (fill) svg.appendChild(svgEl('rect', { x, y, width: end - x, height: 1, fill }));
      x = end;
    }
  });
}

function drawWave(svg: SVGElement, heights: number[] | null, bars: number, unit: number, colors: { bar: string; lead: string }) {
  const width = bars * 2;
  svg.setAttribute('class', `milo-wave${heights ? ' on' : ''}`);
  svg.setAttribute('width', String(width * unit));
  svg.setAttribute('height', String(3.5 * unit));
  svg.setAttribute('viewBox', `0 0 ${width} 3.5`);
  svg.replaceChildren();
  heights?.forEach((amp, i) => {
    const hh = (1 + 2 * amp) * 0.5;
    svg.appendChild(svgEl('rect', { x: i * 2, y: (3.5 - hh) / 2, width: 1, height: hh, fill: i >= bars - 2 && amp > 0 ? colors.lead : colors.bar }));
  });
}

export function mountMilo(host: HTMLElement, initial: MountMiloOptions = {}): MiloHandle {
  let opts: MountMiloOptions = { ...initial };
  const mq = window.matchMedia?.(REDUCED_QUERY);
  let t0 = performance.now();
  let speechDone = false;
  let blinking = false;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let tick: ReturnType<typeof setInterval> | undefined;
  let blinkTimer: ReturnType<typeof setInterval> | undefined;

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

  const derive = () => {
    const size = opts.size ?? 'md';
    const reduced = !!mq?.matches || size === 'xs';
    const state = opts.state ?? 'idle';
    const text = opts.speaking?.trim() ?? '';
    const effective: MiloState = text && (state === 'idle' || state === 'speaking') ? 'speaking' : state;
    const talking = effective === 'speaking' && text.length > 0;
    const mini = size === 'xs';
    const framed = opts.framed ?? !mini;
    return { size, reduced, text, effective, talking, mini, framed, animate: !reduced };
  };

  const render = () => {
    const d = derive();
    const style = STYLES[opts.variant ?? RECOMMENDED_STYLE];
    const art = d.mini ? style.mini : style.art;
    const t = performance.now() - t0;
    const expr = EXPRESSIONS[d.effective];
    const eyes: Eye = blinking ? 'closed' : expr.eyes;
    let mouth: Mouth = expr.mouth;
    let cursor = d.text.length - 1;
    const speaking = d.talking && !speechDone;
    if (speaking) {
      if (d.reduced) mouth = 'open';
      else {
        cursor = Math.min(d.text.length - 1, Math.floor(t / TIMING.msPerChar));
        const held = Math.floor(t / TIMING.mouthHoldMs) * Math.round(TIMING.mouthHoldMs / TIMING.msPerChar);
        mouth = viseme(d.text[Math.min(d.text.length - 1, held)]);
      }
    }
    let light: Light = expr.light;
    if (d.effective === 'thinking' && !d.reduced && Math.floor(t / TIMING.thinkingStepMs) % 2 === 1) light = 'on';

    const rows = composeFrame(art, { eyes, mouth, light });
    const spriteW = rows[0]?.length ?? 32;
    const base = typeof d.size === 'number' ? d.size : SCALE[d.size];
    const scale = base * (d.mini ? 2 : 32 / spriteW);
    const bars = Math.floor((spriteW * scale) / (2 * base));
    const waveCursor = d.reduced ? Math.min(d.text.length - 1, bars - 1) : cursor;
    const label = opts.label ?? 'MILO';
    const shownState: MiloState = d.talking && !speaking ? 'idle' : d.effective;
    const statusText = STATUS_LABEL[shownState];
    const ariaLabel = `${label}, ${statusText.toLowerCase()}`;

    root.style.setProperty('--milo-scale', `${scale}px`);
    root.style.setProperty('--milo-u', `${base}px`);
    drawSprite(sprite, rows, style.palette, scale);

    if (!d.framed) {
      root.className = `milo milo-bare milo-${shownState}`;
      root.setAttribute('role', 'img');
      root.setAttribute('aria-label', ariaLabel);
      root.replaceChildren(spriteWrap);
      return;
    }
    root.className = `milo milo-panel milo-${shownState} milo-v-${style.id}`;
    root.removeAttribute('role');
    root.removeAttribute('aria-label');
    root.dataset.state = shownState;
    name.textContent = label;
    status.textContent = statusText;
    feed.setAttribute('aria-label', ariaLabel);
    drawWave(wave, speaking ? composeWave(d.text, waveCursor, bars) : null, bars, base, style.wave);
    feed.replaceChildren(spriteWrap, wave);

    const showCaption = opts.caption ?? (d.size === 'md' || d.size === 'lg' || (typeof d.size === 'number' && d.size >= 4));
    const children: Node[] = [head, feed];
    if (showCaption) {
      caption.textContent = d.talking ? (d.reduced || !speaking ? d.text : d.text.slice(0, cursor + 1)) : '';
      if (speaking && !d.reduced) {
        const caret = document.createElement('span');
        caret.className = 'milo-caret';
        caret.textContent = '_';
        caption.append(caret);
      }
      children.push(caption);
    }
    if (d.text) {
      if (live.textContent !== d.text) live.textContent = d.text;
      children.push(live);
    }
    root.replaceChildren(...children);
  };

  const stop = () => {
    timers.forEach(clearTimeout);
    timers = [];
    if (tick) clearInterval(tick);
    if (blinkTimer) clearInterval(blinkTimer);
    tick = blinkTimer = undefined;
  };

  const start = () => {
    stop();
    t0 = performance.now();
    speechDone = false;
    blinking = false;
    const d = derive();
    if (d.talking) {
      const ms = d.text.length * TIMING.msPerChar + 350;
      timers.push(setTimeout(() => {
        speechDone = true;
        if (tick) clearInterval(tick);
        tick = undefined;
        render();
        opts.onSpeakEnd?.();
      }, ms));
    }
    if (d.animate && (d.talking || d.effective === 'thinking')) {
      tick = setInterval(render, d.talking ? 40 : TIMING.thinkingStepMs);
    }
    if (d.animate && d.framed && (d.effective === 'idle' || d.effective === 'speaking')) {
      blinkTimer = setInterval(() => {
        blinking = true;
        render();
        timers.push(setTimeout(() => { blinking = false; render(); }, TIMING.blinkMs));
      }, TIMING.blinkEveryMs);
    }
    render();
  };

  const onMotion = () => start();
  mq?.addEventListener('change', onMotion);
  start();

  return {
    update(next) {
      opts = { ...opts, ...next };
      start();
    },
    destroy() {
      stop();
      mq?.removeEventListener('change', onMotion);
      host.replaceChildren();
    },
  };
}
