import { $$ } from './dom';

const GLYPHS = '#%&*+<>/\\|=_-01ABCDEFGHJKLMNOPQRSTUVWXYZ';

/** Letters cycle through glyphs and settle left to right; runs on load and on hover. */
function scramble(el: HTMLElement, text: string, ms = 700) {
  const t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / ms);
    const settled = Math.floor(p * text.length);
    el.textContent = [...text]
      .map((ch, i) => (i < settled || ch === ' ' ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
      .join('');
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function initScramble(reducedMotion: boolean) {
  if (reducedMotion) return;
  for (const el of $$('[data-scramble]')) {
    const text = el.textContent ?? '';
    el.setAttribute('aria-label', text);
    scramble(el, text, 900);
    el.addEventListener('mouseenter', () => scramble(el, text));
  }
}
