import { type MiloState, mountMilo } from '@miloops-hq/milo-avatar/mount';
import { initCmdCycle } from './cmdCycle';
import { initCopy } from './copy';
import { $, $$ } from './dom';
import { mountHeroField } from './heroField';
import { initScramble } from './scramble';
import { initNav, initReveal } from './scroll';
import { initVideo } from './video';
import { initWaitlist } from './waitlist';

document.documentElement.classList.add('js');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

for (const canvas of $$<HTMLCanvasElement>('canvas[data-field]')) {
  mountHeroField(canvas, {
    clearCenter: canvas.dataset.field === 'hero',
    intensity: Number(canvas.dataset.intensity ?? 1),
  });
}

const milo = $('[data-milo]');
if (milo) mountMilo(milo, { size: 'sm', state: 'idle', framed: false });
// Specialists: MILO in each role's colour (CSS), each in its own state so the roster feels alive.
for (const el of $$('[data-spec]')) mountMilo(el, { size: 1.5, state: el.dataset.spec as MiloState, framed: false });

initNav();
initReveal(reducedMotion);
initScramble(reducedMotion);
initCopy();
initCmdCycle(reducedMotion);
initVideo(reducedMotion);
initWaitlist();
