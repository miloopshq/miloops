// Vercel serverless function: POST /api/waitlist adds an email to the Resend audience behind the
// /specialists waitlist. Server-only env (Vercel project settings, or apps/landing/.env.local in dev):
//   RESEND_API_KEY      a Resend API key with access to Audiences
//   RESEND_AUDIENCE_ID  the audience that collects waitlist signups
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function POST(request: Request): Promise<Response> {
  const key = process.env.RESEND_API_KEY;
  const audience = process.env.RESEND_AUDIENCE_ID;
  if (!key || !audience) return json(503, { error: 'Waitlist is not configured.' });

  let body: { email?: unknown; company?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { error: 'Send JSON: { "email": "you@company.com" }.' });
  }
  // Honeypot: a hidden field people never fill in. Pretend it worked so bots learn nothing.
  if (typeof body.company === 'string' && body.company) return json(200, { ok: true });
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > 254) return json(400, { error: 'That email address doesn’t look right.' });

  const r = await fetch(`https://api.resend.com/audiences/${audience}/contacts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, unsubscribed: false }),
  });
  // Already on the list counts as success.
  if (r.ok || r.status === 409) return json(200, { ok: true });
  console.error('resend', r.status, await r.text().catch(() => ''));
  return json(502, { error: 'Couldn’t add you right now. Please try again.' });
}
