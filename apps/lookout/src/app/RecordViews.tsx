import { DecisionsView } from '../features/decisions';
import { PerformanceView } from '../features/performance';
import type { Breakpoint, LookoutApi } from '../hooks';
import type { useAppNavigation } from './useAppNavigation';

/** The full views opened from Records that cover the zones: Trail stats and the Logbook. */
export function RecordViews({
  api,
  bp,
  nav,
}: {
  api: LookoutApi;
  bp: Breakpoint;
  nav: ReturnType<typeof useAppNavigation>;
}) {
  if (nav.statsOpen) return <PerformanceView api={api} bp={bp} onClose={() => nav.setStatsOpen(false)} />;
  if (!nav.decisionsView) return null;
  return (
    <DecisionsView
      api={api}
      bp={bp}
      focus={nav.decisionsView.focus}
      onClose={() => nav.setDecisionsView(null)}
      onOpenTicket={nav.openTicket}
    />
  );
}
