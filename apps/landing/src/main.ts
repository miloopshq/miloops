import '@fontsource/chakra-petch/400.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/share-tech-mono/400.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import './styles.css';
import { mountAgentPicker } from './agentPicker';
import { initCopy } from './copy';
import { $ } from './dom';
import { mountMiloStates } from './miloStates';
import { initNav, initReveal } from './scroll';
import { initSteps } from './steps';
import { mountTerminal } from './terminal';
import { initVideo } from './video';
import { initZones } from './zones';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.classList.add('js');

function initMilo() {
  const host = $('[data-milo]');
  const list = $('[data-milo-states]');
  if (host && list) mountMiloStates(host, list, reducedMotion);
}

initNav();
initReveal(reducedMotion);
initCopy();
mountAgentPicker();
initSteps(reducedMotion);
initZones();
initVideo(reducedMotion);
initMilo();
const term = $('[data-term]');
if (term) mountTerminal(term, reducedMotion);
