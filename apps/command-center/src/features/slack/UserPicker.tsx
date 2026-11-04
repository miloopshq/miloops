import type { SlackUser } from '@miloops-hq/connector-slack';
import { useState, useEffect } from 'react';
import { Choice } from '../../components/ui';
import { slackApi } from './slackApi';

export function UserPicker(props: { value: SlackUser[]; owners: SlackUser[]; onChange: (v: SlackUser[]) => void }) {
  const [members, setMembers] = useState<SlackUser[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    slackApi.members().then(setMembers, (e: Error) => setError(e.message));
  }, []);
  const owner = new Set(props.owners.map((o) => o.id));
  const on = new Set(props.value.map((u) => u.id));
  if (error) return <div className="test-line alert">✕ {error}</div>;
  if (!members) return <span className="t-meta">Loading members…</span>;
  return (
    <div className="choice-row compact sl-members">
      {members.map((m) => (
        <Choice
          key={m.id}
          on={owner.has(m.id) || on.has(m.id)}
          disabled={owner.has(m.id)}
          title={`@${m.name ?? m.id}`}
          sub={owner.has(m.id) ? 'Owner' : undefined}
          onClick={() => props.onChange(on.has(m.id) ? props.value.filter((u) => u.id !== m.id) : [...props.value, m])}
        />
      ))}
    </div>
  );
}
