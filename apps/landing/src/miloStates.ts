// Meet MILO: a live preview of every avatar state. Cycles on its own while in view;
// hovering, focusing or tapping a state takes over, and the cycle resumes after a pause.
import { TIMING, type MiloState } from './milo/frames';
import { mountMilo } from './milo/mountMilo';

const HOLD_MS = 3200;
const RESUME_MS = 4000;
const STATES: readonly MiloState[] = ['idle', 'speaking', 'thinking', 'alert'];
const isState = (s: string | undefined): s is MiloState => STATES.includes(s as MiloState);

export function mountMiloStates(host: HTMLElement, list: HTMLElement, reducedMotion: boolean) {
  const size = window.matchMedia('(max-width: 400px)').matches ? 'md' : 'lg';
  const milo = mountMilo(host, { size, caption: true });
  const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>('button[data-state]'));
  let current = -1;
  let timer = 0;
  let inView = false;
  let paused = false;

  const holdFor = (button: HTMLButtonElement) => {
    const line = button.dataset.line ?? '';
    return Math.max(HOLD_MS, line.length * TIMING.msPerChar + 1600);
  };

  const show = (index: number) => {
    if (index === current) return;
    current = index;
    const button = buttons[index];
    const state = button.dataset.state;
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
    milo.update({ state: isState(state) ? state : 'idle', speaking: button.dataset.line ?? '' });
  };

  const schedule = (ms: number) => {
    window.clearTimeout(timer);
    if (reducedMotion || !inView) return;
    timer = window.setTimeout(() => {
      if (paused) return;
      show((current + 1) % buttons.length);
      schedule(holdFor(buttons[current]));
    }, ms);
  };

  const takeOver = (index: number) => {
    paused = true;
    window.clearTimeout(timer);
    show(index);
  };

  const release = (ms = RESUME_MS) => {
    paused = false;
    schedule(ms);
  };

  buttons.forEach((button, i) => {
    button.addEventListener('mouseenter', () => takeOver(i));
    button.addEventListener('focus', () => takeOver(i));
    button.addEventListener('click', () => {
      takeOver(i);
      if (!list.matches(':hover')) release(holdFor(button) + RESUME_MS);
    });
  });
  list.addEventListener('mouseleave', () => release());
  list.addEventListener('focusout', (e) => {
    if (!list.contains(e.relatedTarget as Node | null)) release();
  });

  show(0);
  if (!('IntersectionObserver' in window)) return;
  new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      if (inView && !paused) schedule(HOLD_MS);
      else window.clearTimeout(timer);
    },
    { threshold: 0.4 },
  ).observe(host);
}
