// Install terminal: types the commands, prints MILOOPS starting up, holds, clears and loops,
// alternating npx with a global install. `frameAt` is pure so the doc GIF renders the same frames.

type Step = { ps: string; cmd: string } | { out: string[] };

const BOOT = [
  '',
  '  <b>MILOOPS</b> <i>0.7.0 ·</i> MILO online',
  '  Command center  <u>http://localhost:7420/</u>',
  '  Tracker         .miloops/',
  '  <i>Press Ctrl+C to stop.</i>',
];

export const SCRIPTS: Step[][] = [
  [
    { ps: '~ $', cmd: 'cd my-app' },
    { ps: '~/my-app $', cmd: 'npx miloops' },
    { out: BOOT },
  ],
  [
    { ps: '~ $', cmd: 'npm i -g miloops' },
    { out: ['<i>added 1 package in 2s</i>'] },
    { ps: '~ $', cmd: 'cd my-app' },
    { ps: '~/my-app $', cmd: 'miloops' },
    { out: BOOT },
  ],
];

const CPS = 15;
const BEFORE_CMD = 0.55;
const BEFORE_OUT = 0.35;
const PER_LINE = 0.07;
export const HOLD = 3;
const CLEAR = 0.35;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** Slightly uneven typing, the same on every loop. */
const charTime = (i: number) => (1 + 0.45 * Math.sin(i * 2.3)) / CPS;

interface Timed { step: Step; show: number; start: number; times: number[]; end: number }

function plan(script: Step[]) {
  let t = 0;
  const steps: Timed[] = script.map((step) => {
    const show = t;
    if ('cmd' in step) {
      const start = t + BEFORE_CMD;
      const times: number[] = [];
      let c = start;
      for (let i = 0; i < step.cmd.length; i++) times.push((c += charTime(i)));
      t = c + 0.12;
      return { step, show, start, times, end: t };
    }
    const start = t + BEFORE_OUT;
    t = start + step.out.length * PER_LINE;
    return { step, show: start, start, times: [], end: t };
  });
  return { steps, done: t, total: t + HOLD + CLEAR };
}

const PLANS = SCRIPTS.map(plan);
export const LOOP = PLANS.reduce((a, p) => a + p.total, 0);

/** Terminal contents at time t (seconds, looping). Returns HTML for a <pre>. */
export function frameAt(t: number, opts: { cursorOn?: boolean } = {}): string {
  let lt = ((t % LOOP) + LOOP) % LOOP;
  let p = PLANS[0];
  for (const candidate of PLANS) {
    p = candidate;
    if (lt < candidate.total) break;
    lt -= candidate.total;
  }
  if (lt >= p.done + HOLD) return '';
  const blink = opts.cursorOn ?? Math.floor(lt / 0.53) % 2 === 0;
  const cur = (on: boolean) => (on ? '<span class="term__cur"></span>' : '<span class="term__cur off"></span>');
  const lines: string[] = [];
  let cursorPlaced = false;
  for (const s of p.steps) {
    if (lt < s.show) break;
    if ('cmd' in s.step) {
      const n = s.times.filter((x) => x <= lt).length;
      const active = lt < s.end;
      const typingNow = active && lt >= s.start;
      lines.push(`<span class="term__ps">${esc(s.step.ps)}</span> <span class="term__cmd">${esc(s.step.cmd.slice(0, n))}</span>${active ? cur(typingNow || blink) : ''}`);
      cursorPlaced = active;
    } else {
      const n = Math.min(s.step.out.length, Math.floor((lt - s.start) / PER_LINE) + 1);
      lines.push(...s.step.out.slice(0, n));
      cursorPlaced = false;
    }
  }
  if (!cursorPlaced) lines.push(cur(blink));
  return lines.join('\n');
}

/** The finished first script, for no-JS and reduced motion. */
export const STATIC = (() => {
  const p = PLANS[0];
  return frameAt(p.done + 0.01, { cursorOn: true });
})();

export function mountTerminal(el: HTMLElement, reducedMotion: boolean) {
  const body = el.querySelector<HTMLElement>('.term__body');
  if (!body) return;
  if (reducedMotion) {
    body.innerHTML = STATIC;
    return;
  }
  let start = performance.now();
  let last = '';
  let wasHidden = true;
  const tick = (now: number) => {
    const hidden = !el.offsetParent;
    if (hidden) wasHidden = true;
    else {
      if (wasHidden) start = now;
      wasHidden = false;
      const html = frameAt((now - start) / 1000);
      if (html !== last) body.innerHTML = last = html;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
