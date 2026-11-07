import type { SlackStatus } from '@teamtrail/connector-slack';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { slackApi } from './slackApi';

/** Remove, then confirm: deletes the tokens and Slack settings from this machine. */
export function SlackRemove({ onRemoved }: { onRemoved: (s: SlackStatus) => void }) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
        Remove
      </Button>
    );
  }
  const remove = () =>
    void slackApi.remove().then(
      (x) => {
        setConfirm(false);
        onRemoved(x);
      },
      () => {},
    );
  return (
    <>
      <Button size="sm" variant="danger" onClick={remove}>
        Remove tokens and settings
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
        Keep
      </Button>
    </>
  );
}
