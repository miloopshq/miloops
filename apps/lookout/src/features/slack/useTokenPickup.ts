import { useRef, useState, useEffect } from 'react';

export const TOKEN_RE = /^(xapp-|xoxb-|xoxp-|xoxe)/;

export const PASTE_KEY =
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform) ? '⌘V' : 'Ctrl+V';

/**
 * Picks up a copied token without a Paste click: the paste shortcut anywhere on the page, or — once
 * the browser has granted clipboard access (Chrome remembers it after the first Paste) — just
 * coming back to this tab. Only token-shaped clipboard text is ever acted on.
 */
export function useTokenPickup(onToken: (token: string, gesture: boolean) => void) {
  const cb = useRef(onToken);
  cb.current = onToken;
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    let last = '';
    const take = (text: string, gesture: boolean) => {
      const t = text.trim();
      if (!TOKEN_RE.test(t) || (!gesture && t === last)) return false;
      last = t;
      cb.current(t, gesture);
      return true;
    };
    const onPaste = (e: ClipboardEvent) => {
      if (take(e.clipboardData?.getData('text') ?? '', true)) e.preventDefault();
    };
    const onFocus = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const p = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
        setAuto(p.state === 'granted');
        if (p.state === 'granted') take(await navigator.clipboard.readText(), false);
      } catch {
        // Clipboard reads without a click are Chromium-only; elsewhere the paste shortcut covers it.
      }
    };
    void onFocus();
    document.addEventListener('paste', onPaste);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      document.removeEventListener('paste', onPaste);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);
  return auto;
}
