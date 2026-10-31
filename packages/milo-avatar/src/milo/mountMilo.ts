/**
 * Framework-free MILO renderer for non-React pages. Same frames, timing, markup and CSS classes as <MiloAvatar>.
 */
import { RECOMMENDED_STYLE, STYLES, TIMING, composeFrame, composeWave } from './frames';
import { caret, createMiloDom, drawSprite, drawWave } from './miloDom';
import {
  blinks,
  miloFace,
  miloLabels,
  miloLayout,
  REDUCED_QUERY,
  resolveMilo,
  SPEECH_STEP_MS,
  SPEECH_TAIL_MS,
  speechDuration,
} from './miloFrame';
import type { MiloSize, MiloState, MiloStyleId } from './types';
import './MiloAvatar.css';

export { TIMING } from './frames';
export type { MiloSize, MiloState } from './types';

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

export function mountMilo(host: HTMLElement, initial: MountMiloOptions = {}): MiloHandle {
  let opts: MountMiloOptions = { ...initial };
  const mq = window.matchMedia?.(REDUCED_QUERY);
  let t0 = performance.now();
  let speechDone = false;
  let blinking = false;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let tick: ReturnType<typeof setInterval> | undefined;
  let blinkTimer: ReturnType<typeof setInterval> | undefined;
  const dom = createMiloDom(host);
  const { root, head, feed, spriteWrap, caption, live } = dom;

  const derive = () => resolveMilo(opts, !!mq?.matches);

  const render = () => {
    const d = derive();
    const style = STYLES[opts.variant ?? RECOMMENDED_STYLE];
    const art = d.mini ? style.mini : style.art;
    const speaking = d.talking && !speechDone;
    const { eyes, mouth, light, cursor } = miloFace(d, performance.now() - t0, blinking, speaking);
    const rows = composeFrame(art, { eyes, mouth, light });
    const { base, scale, bars, waveCursor } = miloLayout(rows, d, cursor);
    const label = opts.label ?? 'MILO';
    const { shownState, status, ariaLabel, showCaption, shown } = miloLabels(
      d,
      label,
      speechDone,
      cursor,
      opts.caption,
    );

    root.style.setProperty('--milo-scale', `${scale}px`);
    root.style.setProperty('--milo-u', `${base}px`);
    drawSprite(dom.sprite, rows, style.palette, scale);

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
    dom.name.textContent = label;
    dom.status.textContent = status;
    feed.setAttribute('aria-label', ariaLabel);
    drawWave(dom.wave, speaking ? composeWave(d.text, waveCursor, bars) : null, bars, base, style.wave);
    feed.replaceChildren(spriteWrap, dom.wave);

    const children: Node[] = [head, feed];
    if (showCaption) {
      caption.textContent = shown;
      if (speaking && !d.reduced) caption.append(caret());
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
    const animate = !d.reduced;
    if (d.talking) {
      timers.push(
        setTimeout(
          () => {
            speechDone = true;
            if (tick) clearInterval(tick);
            tick = undefined;
            render();
            opts.onSpeakEnd?.();
          },
          speechDuration(d.text) + SPEECH_TAIL_MS,
        ),
      );
    }
    if (animate && (d.talking || d.effective === 'thinking')) {
      tick = setInterval(render, d.talking ? SPEECH_STEP_MS : TIMING.thinkingStepMs);
    }
    if (blinks(d, animate)) {
      blinkTimer = setInterval(() => {
        blinking = true;
        render();
        timers.push(
          setTimeout(() => {
            blinking = false;
            render();
          }, TIMING.blinkMs),
        );
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
