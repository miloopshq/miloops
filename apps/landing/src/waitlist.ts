import { $ } from './dom';

/** Specialists waitlist: POSTs { email } to the landing's /api/waitlist function, which adds it to Resend. */
const ENDPOINT = (import.meta.env.VITE_WAITLIST_URL as string | undefined) ?? '/api/waitlist';

export function initWaitlist() {
  const form = $<HTMLFormElement>('[data-waitlist]');
  if (!form) return;
  const status = $('[data-waitlist-status]', form);
  const button = $<HTMLButtonElement>('button[type="submit"]', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const email = data.get('email')?.toString().trim() ?? '';
    if (!email) return;
    form.classList.add('is-busy');
    if (button) button.disabled = true;
    if (status) status.textContent = '';
    try {
      const r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, company: data.get('company')?.toString() ?? '' }),
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'That didn’t go through. Please try again.');
      form.classList.add('is-done');
      if (status) status.textContent = 'You’re on the list. We’ll email you when specialists open.';
    } catch (err) {
      if (status) status.textContent = (err as Error).message;
    } finally {
      form.classList.remove('is-busy');
      if (button) button.disabled = false;
    }
  });
}
