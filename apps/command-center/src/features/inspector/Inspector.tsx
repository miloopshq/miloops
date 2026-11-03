import type { SessionInfo } from '@miloops-hq/core';
import { useState, useEffect } from 'react';
import { Zone, EmptyState } from '../../components/ui';
import type { CommandCenterApi } from '../../hooks';
import { TicketDetail } from './TicketDetail';
import type { Form } from './types';
import { UnspecifiedDetail } from './UnspecifiedDetail';

export function Inspector({
  api,
  sessions,
  bare,
  onOpenChat,
  onOpenDecision,
}: {
  api: CommandCenterApi;
  sessions: SessionInfo[];
  bare?: boolean;
  onOpenChat?: (sessionId: string) => void;
  onOpenDecision?: (id: string) => void;
}) {
  const { snap, selection, actions } = api;
  const [form, setForm] = useState<Form>(null);
  const key = selection?.kind === 'ticket' ? selection.id : selection?.kind === 'unspecified' ? selection.item : '';
  useEffect(() => setForm(null), [key]);

  return (
    <Zone
      area="inspector"
      title="Mission step"
      info="The ticket you selected on the map: what it is, who has it, what blocks it, and its decision once it's made."
      className="inspector"
      bare={bare}
    >
      {!snap ? (
        <EmptyState title="No mission yet" hint="Once there's a mission, pick a ticket on the map to see it here." />
      ) : !selection ? (
        <EmptyState
          title="No ticket selected"
          hint="Pick a ticket on the map: what it is, who has it, what blocks it, and its decision."
        />
      ) : selection.kind === 'unspecified' ? (
        <UnspecifiedDetail snap={snap} item={selection.item} api={api} />
      ) : (
        <TicketDetail
          snap={snap}
          id={selection.id}
          api={api}
          sessions={sessions}
          form={form}
          setForm={setForm}
          onOpenChat={onOpenChat ?? actions.openChat}
          onOpenDecision={onOpenDecision}
        />
      )}
    </Zone>
  );
}
