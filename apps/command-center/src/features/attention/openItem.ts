import type { AttentionItem } from '@miloops-hq/core';

/** Where each kind of queue item opens. Built by the app (app/useAttentionUi.ts) and the inbox (questions). */
export interface AttentionHandlers {
  openQuestion: (questionId: string) => void;
  openTicket: (mapId: string, ticketId: string) => void;
  openKnowledge: () => void;
  openBrief: (mapId: string) => void;
  /** Replan proposals and suggestions: the replan review, once wired; selecting the mission until then. */
  openReplan: (item: AttentionItem) => void;
  selectMission: (mapId: string) => void;
}

function openTicketOrMission(item: AttentionItem, h: AttentionHandlers) {
  if (item.ticketId) h.openTicket(item.mapId, item.ticketId);
  else h.selectMission(item.mapId);
}

/** Opens the place where the human handles the item. Every kind is listed, so a new kind fails to compile here. */
export function openItem(item: AttentionItem, h: AttentionHandlers) {
  switch (item.kind) {
    case 'question':
      return h.openQuestion(item.ref);
    case 'approval':
    case 'blocked':
    case 'policy':
    case 'flag':
    case 'stalled':
    case 'hitl-ready':
      return openTicketOrMission(item, h);
    case 'knowledge':
      return h.openKnowledge();
    case 'brief':
      return h.openBrief(item.mapId);
    case 'replan':
    case 'replan-suggested':
      return h.openReplan(item);
    default: {
      const never: never = item.kind;
      return never;
    }
  }
}
