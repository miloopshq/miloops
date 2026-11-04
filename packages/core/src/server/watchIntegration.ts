import { scanIntegrations } from '../workspaces/scanIntegrations';

/**
 * Compares active claim branches every `pollMs` (default 10 s) and keeps the overlaps in `.agents/integration.json`,
 * where the attention queue reads them. Suggests only: it never creates tickets, rebases or merges.
 */
export function watchIntegration(root: string, opts: { pollMs?: number } = {}): () => void {
  let busy = false;
  const tick = setInterval(
    () => {
      if (busy) return;
      busy = true;
      void scanIntegrations(root)
        .catch(() => {})
        .finally(() => (busy = false));
    },
    opts.pollMs ?? (Number(process.env.MILOOPS_INTEGRATION_POLL_MS) || 10_000),
  );
  tick.unref?.();
  return () => clearInterval(tick);
}
