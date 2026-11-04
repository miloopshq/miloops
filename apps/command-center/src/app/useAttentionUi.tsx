import type { AttentionItem } from '@miloops-hq/core';
import {
  AttentionHeader,
  useAttention,
  useAttentionNotifications,
  type AttentionHandlers,
} from '../features/attention';
import type { KnowledgeStore } from '../features/knowledge';
import type { CommandCenterApi } from '../hooks';
import type { useAppNavigation } from './useAppNavigation';

/**
 * The attention queue, wired to the app: where each kind of item opens, the header's focus control and
 * interrupt count, and browser notifications. `openReplan` defaults to the item's ticket, else its mission;
 * the replan review dialog takes it over when present.
 */
export function useAttentionUi(input: {
  api: CommandCenterApi;
  nav: ReturnType<typeof useAppNavigation>;
  knowledge: Pick<KnowledgeStore, 'setOpen'>;
  reviewBrief: () => void;
  openReplan?: (item: AttentionItem) => void;
}) {
  const { api, nav } = input;
  const attention = useAttention(api.allSnaps);
  useAttentionNotifications(attention.view);
  const selectMission = (mapId: string) => mapId && api.actions.selectMap(mapId);
  const handlers: Omit<AttentionHandlers, 'openQuestion'> = {
    openTicket: nav.openTicket,
    openKnowledge: () => input.knowledge.setOpen(true),
    openBrief: (mapId) => (mapId === api.mapId ? input.reviewBrief() : selectMission(mapId)),
    openReplan:
      input.openReplan ??
      ((item) => (item.ticketId ? nav.openTicket(item.mapId, item.ticketId) : selectMission(item.mapId))),
    selectMission,
  };
  const view = attention.view;
  const header = view && (
    <AttentionHeader view={view} onFocus={(focusUntil) => void attention.savePrefs({ ...view.prefs, focusUntil })} />
  );
  return { attention, handlers, header };
}
