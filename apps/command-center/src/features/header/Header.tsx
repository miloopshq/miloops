import {
  type MapSnapshot,
  type MapDoc,
  type ActivityState,
  type TrackerHealth,
  missionProgress,
  missionUsage,
  missionUsageSources,
  USAGE_SOURCE,
} from '@miloops-hq/core';
import { Panel, MiloMark, Label, Readout, Button } from '../../components/ui';
import { type BriefingStatus, useNow } from '../../hooks';
import { hms, tokens, usd } from '../../lib';
import { PrSyncIndicator } from '../pr-sync';
import { HeaderMilo } from './HeaderMilo';
import { MissionSwitcher } from './MissionSwitcher';
import { TrackerChip } from './TrackerChip';

const BRIEFING_TITLE: Record<BriefingStatus, string> = {
  new: 'While you were away: a new briefing from MILO',
  seen: 'Reopen the last briefing',
  none: 'No briefing yet. MILO briefs you when you come back after being away.',
};

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
  /** Knowledge entries that need the operator (suggestions, flags, stale). */
  knowledge: number;
  knowledgeOpen: boolean;
  onKnowledge: () => void;
  briefingOpen: boolean;
  briefingStatus: BriefingStatus;
  onBriefing: () => void;
}) {
  const { map } = props;
  const now = useNow(1000);
  const waiting = props.activity.pending.length;
  const cur = map && props.snaps[map.id];
  const p = cur && missionProgress(cur);
  const u = map && missionUsage(props.activity, map.id);
  return (
    <Panel as="header" className="header">
      <div className="h-brand">
        <HeaderMilo />
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
        <TrackerChip label={props.trackerLabel} health={props.health} now={now} />
        <PrSyncIndicator now={now} />
        {map && p && (
          <span className="mission-meta">
            <Readout
              label="Mission T+"
              value={hms(now - map.createdAt)}
              title="Mission elapsed time, since it was charted"
            />
            <Readout label="Done" value={`${p.decided}/${p.total}`} />
            {u && (
              <Readout
                className="spend"
                label="Spent"
                value={`${usd(u.costUsd)} · ${tokens(u.inputTokens + u.outputTokens)} tok`}
                title={[
                  'Model spend and tokens for this mission, across every session',
                  ...missionUsageSources(props.activity, map.id).map((x) => USAGE_SOURCE[x].text),
                ].join('\n')}
              />
            )}
          </span>
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
        {map && (
          <Button
            variant="ghost"
            className="mode-chip"
            onClick={props.onToggleMode}
            data-tip={
              map.mode === 'plan-only'
                ? 'Plan only: agents research and decide, but no execute tickets run. Click to switch to Plan + execute.'
                : 'Plan + execute: agents decide, then build what was decided. Click to switch to Plan only, which parks execute tickets.'
            }
          >
            {map.mode === 'plan-only' ? 'Plan only' : 'Plan + execute'}
          </Button>
        )}
        <Button
          variant="ghost"
          className={`briefing-btn ${props.briefingStatus === 'new' ? 'has-new' : ''}`}
          on={props.briefingOpen}
          onClick={props.onBriefing}
          disabled={props.briefingStatus === 'none' && !props.briefingOpen}
          aria-pressed={props.briefingOpen}
          title={BRIEFING_TITLE[props.briefingStatus]}
        >
          <MiloMark size={14} />
          <span className="bl">Briefing</span>
          {props.briefingStatus === 'new' && <span className="new-dot" aria-label="new" />}
        </Button>
        <Button
          variant="ghost"
          className="knowledge-btn"
          data-tip="What agents know about this codebase and product. Review suggestions, flags and stale entries"
          on={props.knowledgeOpen}
          onClick={props.onKnowledge}
          aria-pressed={props.knowledgeOpen}
        >
          Knowledge {props.knowledge > 0 && <span className="n hot">{props.knowledge}</span>}
        </Button>
        <Button
          variant="ghost"
          className="decisions-btn"
          data-tip="Every decision across your missions, with its reasoning. Search, filter and export"
          on={props.decisionsOpen}
          onClick={props.onDecisions}
          aria-pressed={props.decisionsOpen}
        >
          Decisions <span className="n">{props.decisions}</span>
        </Button>
        <Button variant="ghost" onClick={props.onSettings} data-tip="Tracker, verification, briefing and integrations">
          Settings
        </Button>
      </div>
    </Panel>
  );
}
