import { $, $$ } from './dom';

export function initSteps(reducedMotion: boolean) {
  const root = $('[data-tabs]');
  if (!root) return;
  const tabs = $$<HTMLButtonElement>('[role="tab"]', root);
  const panels = $$('[role="tabpanel"]', root);
  const panelsWrap = $('.steps__panels', root);
  const bar = $('.steps__progress span', root);
  const DURATION = 6500;
  let current = 0;
  let auto = !reducedMotion;
  let start = 0;
  let raf = 0;
  let visible = false;

  const select = (index: number, focus = false) => {
    current = (index + tabs.length) % tabs.length;
    tabs.forEach((tab, i) => {
      const on = i === current;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    const desc = $('.steps__d', tabs[current])?.textContent ?? '';
    panelsWrap?.setAttribute('data-desc', desc);
    if (focus) tabs[current].focus();
    start = performance.now();
  };

  const stopAuto = () => {
    auto = false;
    cancelAnimationFrame(raf);
    if (bar) bar.style.transform = 'scaleX(0)';
  };

  const tick = (now: number) => {
    if (!auto) return;
    if (visible) {
      const t = (now - start) / DURATION;
      if (bar) bar.style.transform = `scaleX(${Math.min(t, 1)})`;
      if (t >= 1) select(current + 1);
    } else {
      start = now;
    }
    raf = requestAnimationFrame(tick);
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      stopAuto();
      select(i);
    });
    tab.addEventListener('keydown', (e) => {
      const keys: Record<string, number> = {
        ArrowDown: current + 1,
        ArrowRight: current + 1,
        ArrowUp: current - 1,
        ArrowLeft: current - 1,
        Home: 0,
        End: tabs.length - 1,
      };
      if (!(e.key in keys)) return;
      e.preventDefault();
      stopAuto();
      select(keys[e.key], true);
    });
  });

  new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { threshold: 0.3 }).observe(root);
  select(0);
  if (auto) raf = requestAnimationFrame(tick);
}
