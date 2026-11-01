import { $, $$ } from './dom';

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

export function initCopy() {
  for (const button of $$<HTMLButtonElement>('[data-copy]')) {
    button.addEventListener('click', async () => {
      const text = button.dataset.copy ?? '';
      const ok = await writeClipboard(text);
      toast(ok ? `Copied: ${text}` : 'Copy failed');
      if (!ok) return;
      button.classList.add('is-done');
      window.setTimeout(() => button.classList.remove('is-done'), 1600);
    });
  }
}
