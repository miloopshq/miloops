import { $$ } from './dom';

export function initZones() {
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
