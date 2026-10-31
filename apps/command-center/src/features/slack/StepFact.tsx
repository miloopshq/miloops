import type { SlackStatus } from '@miloops-hq/connector-slack';

export function StepFact({ s, n }: { s: SlackStatus; n: number }) {
  const fact =
    n === 3
      ? s.setup.appId && `app ${s.setup.appId}`
      : n === 4
        ? s.workspace && `${s.workspace.name} · @${s.bot?.name ?? 'milo'}`
        : n === 5
          ? s.owners[0] &&
            `owner ${s.owners[0].name ?? s.owners[0].id}${s.owners[0].via === 'git-email' ? ' · git email' : ''}`
          : undefined;
  return fact ? <span className="mono-label dim">{fact}</span> : null;
}
