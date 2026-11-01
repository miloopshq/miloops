// "Mission field": columns of short bars framing the hero copy. Each bar is a ticket:
// cyan done, copper a specialist working, white highlights, and a rare red blink that waits on you.
// Columns scroll at their own pace, a brightness wave rolls through, and on load they grow outward.

type Options = {
  /** Keep a clear lane in the middle for the copy. */
  clearCenter?: boolean;
  /** 0..1 overall brightness. */
  intensity?: number;
};

const BAR_W = 40;
const BAR_H = 4;
const PITCH = 10;
const GAP = 16;
const COLORS = [
  [132, 182, 194], // done (cyan)
  [225, 233, 234], // highlight (white)
  [196, 138, 98], // working (copper)
  [255, 77, 66], // waiting on you (red)
];
const WEIGHTS = [0.6, 0.2, 0.17, 0.03];
const PATTERN = 96;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function pick(r: number) {
  let acc = 0;
  for (let i = 0; i < WEIGHTS.length; i++) if (r < (acc += WEIGHTS[i])) return i;
  return 0;
}

type Column = { pattern: Int8Array; speed: number; phase: number; delay: number };

function makeColumns(count: number, seed: number): Column[] {
  const r = rng(seed);
  return Array.from({ length: count }, () => {
    const pattern = new Int8Array(PATTERN).fill(-1);
    for (let i = 0; i < PATTERN;) {
      const lit = r() < 0.6;
      const color = pick(r());
      // Red is a single blink ("waiting on you"), never a run.
      const run = lit && color === 3 ? 1 : 2 + Math.floor(r() * (lit ? 10 : 7));
      for (let k = 0; k < run && i < PATTERN; k++, i++) pattern[i] = lit ? color : -1;
    }
    return { pattern, speed: (0.6 + r() * 2.2) * (r() < 0.5 ? -1 : 1), phase: r() * 10, delay: 0 };
  });
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function mountHeroField(canvas: HTMLCanvasElement, opts: Options = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const intensity = opts.intensity ?? 1;
  let w = 0;
  let h = 0;
  let cols: Column[] = [];
  let start = performance.now();
  let raf = 0;
  let last = 0;
  let visible = true;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.ceil(w / (BAR_W + GAP)) + 1;
    cols = makeColumns(count, 7);
    const mid = (count - 1) / 2;
    cols.forEach((c, i) => (c.delay = (1 - Math.abs(i - mid) / mid) * 0.9));
    if (reduced || !raf) draw(reduced ? 99 : (performance.now() - start) / 1000);
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    const rows = Math.ceil(h / PITCH) + 1;
    const offsetX = (w - cols.length * (BAR_W + GAP) + GAP) / 2;
    cols.forEach((c, ci) => {
      const x = offsetX + ci * (BAR_W + GAP);
      const centre = Math.abs(x + BAR_W / 2 - w / 2) / (w / 2);
      // Narrow screens keep only the outer edge so the copy stays readable.
      const lane = opts.clearCenter ? (w < 700 ? smooth(0.8, 1.02, centre) : smooth(0.42, 0.78, centre)) : 1;
      if (lane <= 0.01) return;
      const grow = reduced ? 1 : smooth(0, 1, (t - c.delay) / 1.1);
      if (grow <= 0) return;
      const shift = t * c.speed * 3 + c.phase;
      const whole = Math.floor(shift);
      for (let r = 0; r < rows; r++) {
        const y = r * PITCH;
        const fromEdge = Math.min(y, h - y) / (h / 2);
        if (fromEdge > grow * 1.05) continue;
        // Fade under the nav so the logo and links stay readable.
        const top = opts.clearCenter ? smooth(40, 150, y) : 1;
        const idx = c.pattern[(((r + whole) % PATTERN) + PATTERN) % PATTERN];
        const wave = 0.5 + 0.5 * Math.sin(t * 0.9 + ci * 0.55 - r * 0.07);
        let a: number;
        let rgb = COLORS[Math.max(idx, 0)];
        if (idx < 0) {
          a = 0.05 + 0.04 * wave;
          rgb = COLORS[0];
        } else if (idx === 3) {
          a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 5 + ci));
        } else a = 0.25 + 0.75 * wave;
        a *= lane * top * intensity;
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`;
        ctx.fillRect(x, y, BAR_W, BAR_H);
      }
    });
  };

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (!visible || now - last < 33) return;
    last = now;
    draw((now - start) / 1000);
  };

  resize();
  new ResizeObserver(resize).observe(canvas);
  if (reduced) return;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) last = 0;
  });
  start = performance.now();
  raf = requestAnimationFrame(loop);
}
