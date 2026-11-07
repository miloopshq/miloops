import { ScoutAvatar, STYLES, type ScoutState, type ScoutStyleId } from '../../src/scout';
import { LINES, SPEAK_AT } from '../content';
import { InboxPane } from './InboxPane';
import { LandingSection } from './LandingSection';

export function States({ variant }: { variant: ScoutStyleId }) {
  const states: { s: ScoutState; title: string; speaking?: string; at: number }[] = [
    { s: 'idle', title: 'Idle', at: 0 },
    { s: 'speaking', title: 'Speaking', speaking: LINES.plan, at: SPEAK_AT },
    { s: 'thinking', title: 'Thinking', at: 2 * 520 },
    { s: 'alert', title: 'Alert · decision waiting', at: 0 },
  ];
  return (
    <div className="sheet" data-capture="states">
      <h1 className="sheet-title">
        Scout <span>// {STYLES[variant].name.toLowerCase()} · states</span>
      </h1>
      <div className="grid-4">
        {states.map((x) => (
          <section key={x.s} className="col">
            <h2 className="col-title">
              <b>{x.title}</b>
            </h2>
            <ScoutAvatar variant={variant} state={x.s} speaking={x.speaking} size="md" at={x.at} />
          </section>
        ))}
      </div>
      <div className="context">
        <div>
          <h2 className="col-title sub">
            <b>Lookout</b>
            <span>Inbox conversation pane</span>
          </h2>
          <InboxPane variant={variant} />
        </div>
        <div>
          <h2 className="col-title sub">
            <b>Landing page</b>
            <span>Scout section</span>
          </h2>
          <LandingSection variant={variant} />
        </div>
      </div>
    </div>
  );
}
