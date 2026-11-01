import { useState } from 'react';
import { Button } from '../../components/ui';

const EXAMPLE = `{
  "v": 1,
  "checks": {
    "test": { "run": ["npm", "test"] },
    "lint": { "run": ["npm", "run", "lint"] }
  },
  "run": ["test", "lint"]
}
`;

/** Shown when the repo has no verification.json: what the file is, and a starter to copy. */
export function VerificationSetup({ file }: { file: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard.writeText(EXAMPLE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return (
    <div className="vf-setup">
      <b className="vf-setup-h">Set up checks</b>
      <p>
        Checks are the commands that prove a ticket is really done, such as your tests and linter. They live in{' '}
        <code>{file}</code> in your repo. Create it with the commands you trust, then commit it:
      </p>
      <div className="vf-snippet">
        <pre>{EXAMPLE}</pre>
        <Button size="sm" variant="ghost" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="dim">
        <code>run</code> lists the checks that run on every completion. Each <code>run</code> command is a list of
        words, not a shell line. Until the file exists, levels above Off can’t run their checks, so those completions
        stop and wait for you.
      </p>
    </div>
  );
}
