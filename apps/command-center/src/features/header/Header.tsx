import {
  type MapSnapshot,
  type MapDoc,
  type ActivityState,
  type TrackerHealth,
  missionProgress,
  BRAND,
} from '@miloops-hq/core';
import { Panel, MiloMark, Wordmark, Label, Readout, Button } from '../../components/ui';
import { useNow } from '../../hooks';
import { hms } from '../../lib';
import { MissionSwitcher } from './MissionSwitcher';
import { TrackerChip } from './TrackerChip';
import { TrackerPulse } from './TrackerPulse';

export function Header(props: {
  repo: string;
  snaps: Record<string, MapSnapshot>;
  map?: MapDoc;
  activity: ActivityState;
  health: TrackerHealth;
  trackerLabel: string;
  onSelectMap: (id: string) => void;
  onNewMission: () => void;
  onToggleMode: () => void;
  onSettings: () => void;
  /** Set when the Slack connection needs attention (revoked token, app uninstalled). */
  slackAlert?: string;
  onSlack: () => void;
  decisions: number;
  decisionsOpen: boolean;
  onDecisions: () => void;
  briefingOpen: boolean;
  onBriefing: () => void;
}) {
  const { map } = props;
  const now = useNow(1000);
  const waiting = props.activity.pending.length;
  const cur = map && props.snaps[map.id];
  const p = cur && missionProgress(cur);
  return (
    <Panel as="header" className="header">
      <div className="h-brand">
        <MiloMark size={28} className="logo" title={BRAND.name} />
        <Wordmark className="wordmark" />
      </div>
      <div className="h-title">
        <div className="h-line1">
          <span className="repo">{props.repo}</span>
          <span className="sep">/</span>
          <MissionSwitcher {...props} />
        </div>
        <div className="h-dest" title={map?.sections.destination}>
          <Label size="sm">Destination</Label>
          {map?.sections.destination ?? '—'}
        </div>
      </div>
      <div className="h-right">
        {map && p && (
          <span className="mission-meta">
            <Readout
              label="Mission T+"
              value={hms(now - map.createdAt)}
              title="Mission elapsed time, since it was charted"
            />
            <Readout label="Decided" value={`${p.decided}/${p.total}`} />
          </span>
        )}
        {map && (
          <Button size="sm" className="mode-chip" onClick={props.onToggleMode} title="Mission mode">
            {map.mode === 'plan-only' ? 'Plan only' : 'Plan + execute'}
          </Button>
        )}
        {waiting > 0 && (
          <span className="waiting-chip" title={`${waiting} waiting on you`}>
            <MiloMark variant="alert" size={14} />
            <b>{waiting}</b>
            <span className="wl">&nbsp;waiting on you</span>
          </span>
        )}
        {props.slackAlert && (
          <Button size="sm" variant="urgent" onClick={props.onSlack} title={props.slackAlert}>
            Slack disconnected
          </Button>
        )}
        <TrackerChip label={props.trackerLabel} health={props.health} now={now} />
        <TrackerPulse health={props.health} now={now} />
        <Button
          variant="ghost"
          className="briefing-btn"
          on={props.briefingOpen}
          onClick={props.onBriefing}
          aria-pressed={props.briefingOpen}
          title="While you were away"
        >
          <MiloMark size={14} />
          <span className="bl">Briefing</span>
        </Button>
        <Button
          variant="ghost"
          className="decisions-btn"
          on={props.decisionsOpen}
          onClick={props.onDecisions}
          aria-pressed={props.decisionsOpen}
        >
          Decisions <span className="n">{props.decisions}</span>
        </Button>
        <Button variant="ghost" onClick={props.onSettings}>
          Settings
        </Button>
      </div>
    </Panel>
  );
}
