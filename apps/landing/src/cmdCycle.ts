import { $, $$ } from './dom';

const HOLD_MS = 2600;
const TYPE_MS = 38;
const ERASE_MS = 18;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Install box that types through its commands (start, then connect Claude Code or Codex).
 * The copy button always copies the command on screen. Reduced motion keeps the first one.
 */
export function initCmdCycle(reducedMotion: boolean) {
  for (const box of $$('[data-cycle]')) {
    const text = $('.cmd__text', box);
    const label = $('.cmd__label', box);
    const copy = $<HTMLButtonElement>('.copy', box);
    const steps = (box.dataset.cycle ?? '')
      .split('|')
      .map((s) => s.split('::'))
      .map(([cmd, hint]) => ({ cmd: cmd.trim(), hint: hint?.trim() ?? '' }));
    if (!text || steps.length < 2 || reducedMotion) continue;
    let visible = true;
    new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(box);
    const show = (i: number) => {
      if (copy) copy.dataset.copy = steps[i].cmd;
      if (label) label.textContent = steps[i].hint;
    };
    void (async () => {
      for (let i = 0; ; i = (i + 1) % steps.length) {
        show(i);
        await sleep(HOLD_MS);
        while (!visible || document.hidden) await sleep(500);
        const next = steps[(i + 1) % steps.length].cmd;
        if (label) label.textContent = steps[(i + 1) % steps.length].hint;
        let cur = steps[i].cmd;
        // Erase back to the shared prefix ("npx miloops"), then type the rest of the next command.
        let common = 0;
        while (common < cur.length && cur[common] === next[common]) common++;
        while (cur.length > common) {
          cur = cur.slice(0, -1);
          text.textContent = cur;
          await sleep(ERASE_MS);
        }
        while (cur.length < next.length) {
          cur = next.slice(0, cur.length + 1);
          text.textContent = cur;
          await sleep(TYPE_MS);
        }
      }
    })();
  }
}
