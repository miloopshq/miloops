import { integrationTicketFor } from '../../workspaces/integrationTicket';
import type { AttentionSource, Candidate } from '../types';

/**
 * Active claim branches that changed the same files (the integration check). Suggests a ticket to bring them
 * together; gone once that ticket exists. Never merges or rebases anything.
 */
export const integrationSource: AttentionSource = {
  kind: 'integration',
  collect({ integrations = [], snaps, now }) {
    return integrations.flatMap((o): Candidate[] => {
      const snap = snaps.find((s) => s.map.id === o.mapId);
      if (!snap || integrationTicketFor(snap.tickets, o)) return [];
      const [a, b] = o.tickets;
      const shown = o.files.slice(0, 2).join(', ');
      const more = o.files.length > 2 ? ` (+${o.files.length - 2} more)` : '';
      return [
        {
          kind: 'integration',
          mapId: o.mapId,
          ticketId: b.ticketId,
          title: `${a.ticketKey} and ${b.ticketKey} changed the same files`,
          since: o.at || now,
          urgency: 'soon',
          ref: `${a.ticketId}+${b.ticketId}`,
          agent: b.agent,
          holds: [],
          notes: [`both changed ${shown}${more}`, 'add a ticket to bring them together'],
        },
      ];
    });
  },
};
