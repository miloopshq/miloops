import { ScoutAvatar, type ScoutStyleId } from '../../src/scout';

export function InboxPane({ variant }: { variant: ScoutStyleId }) {
  return (
    <div className="pane">
      <div className="pane-h">
        <span className="chip hot">Inbox</span>
        <span className="dim">WF-14 · package build · session 2</span>
      </div>
      <div className="pane-b">
        <ScoutAvatar variant={variant} size="sm" state="alert" />
        <div className="msgs">
          <div className="msg">
            <div className="meta">Scout · 10:42</div>Session 2 needs your call on the auth provider before it can
            continue.
          </div>
          <div className="msg">
            <div className="meta">agent-2 · 10:42</div>GitHub OAuth keeps the CLI login simple; magic links need an
            email service.
          </div>
          <div className="answer">
            <span>Use GitHub OAuth</span>
            <span>Magic links</span>
            <span className="dim">Reply...</span>
          </div>
        </div>
      </div>
    </div>
  );
}
