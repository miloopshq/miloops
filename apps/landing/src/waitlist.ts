import { $ } from './dom';

/**
 * Specialists waitlist. With VITE_WAITLIST_URL set, the form POSTs { email } as JSON there;
 * without it, it opens a prefilled email so no signup is lost before a list service is chosen.
 */
const ENDPOINT = import.meta.env.VITE_WAITLIST_URL as string | undefined;
const FALLBACK_TO = 'hello@miloops.app';

export function initWaitlist() {
  const form = $<HTMLFormElement>('[data-waitlist]');
  if (!form) return;
  const status = $('[data-waitlist-status]', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = new FormData(form).get('email')?.toString().trim() ?? '';
    if (!email) return;
    if (!ENDPOINT) {
      const subject = encodeURIComponent('MILOOPS specialists waitlist');
      const body = encodeURIComponent(`Please add ${email} to the specialists waitlist.`);
      location.href = `mailto:${FALLBACK_TO}?subject=${subject}&body=${body}`;
      return;
    }
    form.classList.add('is-busy');
    try {
      const r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, list: 'specialists' }),
      });
      if (!r.ok) throw new Error(String(r.status));
      form.classList.add('is-done');
      if (status) status.textContent = 'You’re on the list. We’ll email you when specialists open.';
    } catch {
      if (status) status.textContent = 'That didn’t go through. Please try again.';
    } finally {
      form.classList.remove('is-busy');
    }
  });
}
