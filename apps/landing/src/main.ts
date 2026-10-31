import '@fontsource/chakra-petch/400.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/share-tech-mono/400.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import './styles.css';
import { mountAgentPicker } from './agentPicker';
import { mountMiloStates } from './miloStates';
import { mountTerminal } from './terminal';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.classList.add('js');

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel));

function initNav() {
  const nav = $('#nav');
  if (!nav) return;
  const update = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

function initReveal() {
  const items = $$('.reveal');
  const siblingsIndex = new Map<Element, number>();
  for (const el of items) {
    const parent = el.parentElement;
    if (!parent) continue;
    const i = siblingsIndex.get(parent) ?? 0;
    (el as HTMLElement).style.setProperty('--i', String(Math.min(i, 6)));
    siblingsIndex.set(parent, i + 1);
  }
  const title = $('.hero__title');
  if (reducedMotion || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    title?.classList.add('is-in');
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  items.forEach((el) => io.observe(el));
  requestAnimationFrame(() => title?.classList.add('is-in'));
}

let toastTimer = 0;
function toast(message: string) {
  const el = $('.toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-on');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('is-on'), 1800);
}

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function initCopy() {
  for (const button of $$<HTMLButtonElement>('[data-copy]')) {
    button.addEventListener('click', async () => {
      const text = button.dataset.copy ?? '';
      const ok = await writeClipboard(text);
      toast(ok ? `Copied: ${text}` : 'Copy failed');
      const use = button.querySelector('use');
      if (!ok || !use) return;
      button.classList.add('is-done');
      use.setAttribute('href', '#i-check');
      window.setTimeout(() => {
        button.classList.remove('is-done');
        use.setAttribute('href', '#i-copy');
      }, 1600);
    });
  }
}

function initSteps() {
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

function initZones() {
  const zones = $$('.zone');
  const buttons = $$<HTMLButtonElement>('.zones__list button');
  const activate = (name: string) => {
    zones.forEach((z) => z.classList.toggle('is-active', z.dataset.zone === name));
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.zone === name)));
  };
  const hoverable = window.matchMedia('(hover: hover)').matches;
  for (const button of buttons) {
    const name = button.dataset.zone ?? '';
    button.addEventListener('click', () => activate(name));
    button.addEventListener('focus', () => activate(name));
    if (hoverable) button.addEventListener('mouseenter', () => activate(name));
  }
  activate(buttons[0]?.dataset.zone ?? 'inbox');
}

function initVideo() {
  const video = $<HTMLVideoElement>('.hero__video');
  if (!video) return;
  if (reducedMotion) {
    video.removeAttribute('autoplay');
    video.pause();
    return;
  }
  let userPaused = false;
  video.addEventListener('pause', () => {
    if (!document.hidden && video.dataset.autoPaused !== '1') userPaused = true;
  });
  video.addEventListener('play', () => (userPaused = false));
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      video.dataset.autoPaused = '0';
      if (!userPaused) void video.play().catch(() => {});
    } else if (!video.paused) {
      video.dataset.autoPaused = '1';
      video.pause();
    }
  }, { threshold: 0.15 }).observe(video);
}

function initMilo() {
  const host = $('[data-milo]');
  const list = $('[data-milo-states]');
  if (host && list) mountMiloStates(host, list, reducedMotion);
}

initNav();
initReveal();
initCopy();
mountAgentPicker();
initSteps();
initZones();
initVideo();
initMilo();
const term = $('[data-term]');
if (term) mountTerminal(term, reducedMotion);
