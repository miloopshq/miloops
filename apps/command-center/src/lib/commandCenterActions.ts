import {
  type AuditDecision,
  claim,
  type MapMode,
  type MapSnapshot,
  promoteToTicket,
  recordDecision,
  release,
  resolve,
  ruleOutOfScope,
  type ScopeTarget,
  setMapMode,
  supersedeDecision,
  type TicketType,
} from '@miloops-hq/core';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { OPERATOR } from './operator';
import type { Runtime } from './runtime';
import type { Selection } from './selection';

export interface ActionDeps {
  rt: Runtime;
  /** Logs `label`, runs `fn`, and surfaces a rejection as the error toast. */
  guard: (label: string, fn: () => Promise<unknown>) => Promise<void>;
  setMapId: (id: string | undefined) => void;
  mapIdRef: MutableRefObject<string | undefined>;
  snapRef: MutableRefObject<MapSnapshot | undefined>;
  setChatSession: Dispatch<SetStateAction<string | undefined>>;
  setSelection: Dispatch<SetStateAction<Selection>>;
}

/** Operator actions of the command center, built once per runtime by `useCommandCenter`. */
export function createActions({ rt, guard, setMapId, mapIdRef, snapRef, setChatSession, setSelection }: ActionDeps) {
  const asOperator = { actorKind: 'operator' as const, journal: rt.journal };
  return {
    selectMap: (id: string) => setMapId(id),
    openChat: (sessionId: string | undefined) => setChatSession(sessionId),
    answer: (questionId: string, text: string) => rt.activity.answer(questionId, text, OPERATOR),
    claim: (ticketId: string) =>
      guard('Claim', () => claim(rt.adapter, mapIdRef.current!, ticketId, { ...asOperator, assignee: OPERATOR })),
    release: (ticketId: string) =>
      guard('Release claim', () =>
        release(rt.adapter, mapIdRef.current!, ticketId, { ...asOperator, actor: OPERATOR }),
      ),
    /** An agent's claim back to the queue, with a handoff comment of its notes. */
    releaseLease: (ticketId: string) =>
      guard('Release to queue', () => rt.leases.release(mapIdRef.current!, ticketId, OPERATOR)),
    resolve: (ticketId: string, answer: string, extra: { rationale?: string; alternatives?: string[] } = {}) =>
      guard('Resolve · record answer', async () => {
        const t = snapRef.current?.tickets.find((x) => x.id === ticketId);
        if (t && !t.assignee)
          await claim(rt.adapter, mapIdRef.current!, ticketId, { ...asOperator, assignee: OPERATOR });
        await resolve(rt.adapter, mapIdRef.current!, ticketId, {
          ...asOperator,
          answer,
          author: OPERATOR,
          decision: { ...extra, source: { kind: 'command-center', label: 'Ticket inspector' } },
        });
      }),
    /** Replace a decision. Derived (tracker-only) entries are persisted first so the chain has both ends. */
    supersede: (d: AuditDecision, input: { answer: string; rationale?: string; alternatives?: string[] }) =>
      guard(`Supersede ${d.id}`, async () => {
        let id = d.id;
        if (d.derived) {
          const { id: _id, mapId: _m, derived: _d, supersededBy: _s, ...rest } = d;
          id = (await recordDecision(rt.adapter, d.mapId, rest, { appendToMission: false })).id;
        }
        await supersedeDecision(rt.adapter, d.mapId, id, {
          ...input,
          decidedBy: OPERATOR,
          participants: [{ id: OPERATOR }],
          source: { kind: 'command-center', label: 'Decisions view' },
        });
      }),
    graduate: ({
      unspecified,
      ...ticket
    }: {
      unspecified: string;
      type: TicketType;
      title: string;
      blockedBy: string[];
      hitl: boolean;
    }) =>
      guard(`Promote to ticket · ${unspecified}`, async () => {
        const t = await promoteToTicket(rt.adapter, mapIdRef.current!, unspecified, ticket);
        setSelection({ kind: 'ticket', id: t.id });
      }),
    ruleOut: (target: ScopeTarget, reason: string) =>
      guard('Rule out of scope', async () => {
        await ruleOutOfScope(rt.adapter, mapIdRef.current!, target, {
          ...asOperator,
          reason,
          author: OPERATOR,
          source: { kind: 'command-center', label: 'Ticket inspector' },
        });
        setSelection(null);
      }),
    setMode: (mode: MapMode) => guard(`Mission mode · ${mode}`, () => setMapMode(rt.adapter, mapIdRef.current!, mode)),
  };
}
