export function ago(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

/** Elapsed duration as HH:MM:SS. */
export function hms(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
}

export const clock = (n: number) => new Date(n).toTimeString().slice(0, 8);

/** Short duration for readouts: 850ms, 42s, 3m 10s, 2h 05m. */
export function dur(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

export function tokens(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export const usd = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(1)}`;

export const day = (n: number) => new Date(n).toISOString().slice(0, 10);

export const hm = (n: number) => new Date(n).toTimeString().slice(0, 5);

export const stamp = (n: number) => `${day(n)} ${hm(n)}`;

export const syncedAgo = (t?: number) => {
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
};

export const hhmm = (t?: number) =>
  t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
