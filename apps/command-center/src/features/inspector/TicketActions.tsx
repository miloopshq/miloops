import type { NodeState, SessionInfo, Ticket } from '@miloops-hq/core';
import { Button } from '../../components/ui';
import type { CommandCenterApi } from '../../hooks';
import type { Form } from './types';

/** What the operator can do with a ticket from the inspector, each button explained on hover. */
export function TicketActions(props: {
  t: Ticket;
  state: NodeState;
  session?: SessionInfo;
  mine: boolean;
  form: Form;
  setForm: (f: Form) => void;
  actions: CommandCenterApi['actions'];
  /** Demo only: a simulated agent can be dispatched from here. */
  simulated: boolean;
  onOpenChat: (id: string) => void;
}) {
  const { t, state, session, mine, form, setForm, actions, simulated, onOpenChat } = props;
  return (
    <div className="actions">
      {session && (
        <Button
          variant={session.waitingOn ? 'urgent' : 'default'}
          onClick={() => onOpenChat(session.id)}
          data-tip={
            session.waitingOn ? 'The agent is waiting for your answer' : 'Open the conversation with this agent'
          }
        >
          {session.waitingOn ? 'Answer' : 'Conversation'}
        </Button>
      )}
      {state === 'frontier' && (
        <>
          {simulated && (
            <Button variant="primary" onClick={() => actions.work(t.id)} data-tip="Send an agent to work this ticket">
              Dispatch agent
            </Button>
          )}
          <Button onClick={() => actions.claim(t.id)} data-tip="Take this ticket yourself, so no agent picks it up">
            Claim
          </Button>
        </>
      )}
      {(state === 'frontier' || (state === 'claimed' && mine)) && (
        <Button
          on={form === 'resolve'}
          onClick={() => setForm(form === 'resolve' ? null : 'resolve')}
          data-tip="Answer it yourself and close the ticket, with a decision record"
        >
          Resolve…
        </Button>
      )}
      {mine && state === 'claimed' && (
        <Button onClick={() => actions.release(t.id)} data-tip="Give the ticket back to the queue">
          Release
        </Button>
      )}
      {(state === 'frontier' || state === 'blocked' || state === 'parked') && (
        <Button
          variant="danger"
          on={form === 'rule'}
          onClick={() => setForm(form === 'rule' ? null : 'rule')}
          data-tip="Move it out of scope. It's set aside with your reason, not deleted"
        >
          Rule out…
        </Button>
      )}
    </div>
  );
}
