import type { SlackStatus } from '@miloops-hq/connector-slack';
import { useState } from 'react';
import { PasteToken } from './PasteToken';
import { slackApi } from './slackApi';

export function ReconnectPaste(props: { set: (s: SlackStatus) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const onToken = (token: string) => {
    setBusy(true);
    void slackApi.token(token).then(
      (r) => {
        setBusy(false);
        setError(r.ok ? undefined : r.error);
        props.set(r.status);
      },
      (e: Error) => {
        setBusy(false);
        setError(e.message);
      },
    );
  };
  return (
    <>
      <PasteToken busy={busy} placeholder="xapp-… or xoxb-…" onToken={onToken} />
      {error && <div className="test-line alert">✕ {error}</div>}
    </>
  );
}
