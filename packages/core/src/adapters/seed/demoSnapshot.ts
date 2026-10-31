import type { MapSnapshot, Ticket } from '../../model/types';
import { SEED_TICKETS } from './seedTickets';

/** A mid-flight demo map: some decisions made, one ticket claimed, a live frontier and unspecified items. */
export function demoSnapshot(now = Date.now()): MapSnapshot {
  const id = (n: number) => `t-${n}`;
  const tickets: Ticket[] = SEED_TICKETS.map((s, i) => {
    const createdAt = now - (SEED_TICKETS.length - i) * 3_600_000;
    const comments = s.resolution
      ? [
          {
            id: `c-${s.n}`,
            author: 'claude-07',
            body: `**Resolution**\n\n${s.resolution}`,
            createdAt: createdAt + 1_800_000,
          },
        ]
      : s.status === 'ruled'
        ? [
            {
              id: `c-${s.n}`,
              author: 'mpocock',
              body: '**Ruled out of scope**\n\nTransport is already TLS; at-rest E2EE is a separate initiative.',
              createdAt,
            },
          ]
        : [];
    return {
      id: id(s.n),
      key: `#${s.n}`,
      title: s.title,
      type: s.type,
      hitl: s.hitl,
      body: `Decision ticket for the Fieldnote offline sync mission.\n\nPart of mission #142.`,
      state: s.status === 'decided' || s.status === 'ruled' ? 'closed' : 'open',
      closeReason: s.status === 'decided' ? 'completed' : s.status === 'ruled' ? 'not_planned' : undefined,
      assignee: s.assignee,
      blockedBy: (s.blockedBy ?? []).map(id),
      comments,
      createdAt,
      updatedAt: createdAt,
      closedAt: s.status === 'decided' || s.status === 'ruled' ? createdAt + 1_800_000 : undefined,
    };
  });
  return {
    map: {
      id: 'map-142',
      key: '#142',
      title: 'Offline-first sync for Fieldnote',
      mode: 'plan+execute',
      createdAt: now - 20 * 3_600_000,
      updatedAt: now,
      sections: {
        destination:
          'Fieldnote mobile users can capture and edit notes for a week with no signal, and every edit merges cleanly when they reconnect.',
        notes:
          'Current sync is request/response over REST; ~4% of sessions hit a conflict dialog. Mobile is React Native. Backend is Postgres + a Node API.',
        decisions: SEED_TICKETS.filter((s) => s.resolution).map((s) => ({
          ticketId: id(s.n),
          ticketKey: `#${s.n}`,
          text: s.resolution!.split('. ')[0].replace(/\.$/, '') + '.',
        })),
        unspecified: [
          'Attachments and photo sync',
          'Multi-device presence indicators',
          'Server-side merge for legacy API clients',
          'Quota enforcement when a device exceeds budget',
          'Audit log of merged edits',
          'Desktop app parity',
        ],
        outOfScope: [
          '#155 End-to-end encryption of sync payloads — separate initiative',
          'Real-time collaborative cursors — single-author notes',
          'Web client offline support — mobile first',
        ],
      },
    },
    tickets,
  };
}
