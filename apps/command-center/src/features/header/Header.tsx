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
import type { ReactNode } from 'react';
import { Panel, MiloMark, Label, Readout, Button } from '../../components/ui';
import { type BriefingStatus, useNow } from '../../hooks';
import { hms, tokens, usd } from '../../lib';
import { PrSyncIndicator } from '../pr-sync';
import { MissionSwitcher } from './MissionSwitcher';
import { RecordsMenu } from './RecordsMenu';
import { ThemeToggle } from './ThemeToggle';
import { TrackerChip } from './TrackerChip';

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
  onToggleTheme: (night: boolean) => void;
  /** Set when the Slack connection needs attention (revoked token, app uninstalled). */
  slackAlert?: string;
  onSlack: () => void;
  /** Focus mode and what interrupts now; replaces the plain waiting count when given. */
  attention?: ReactNode;
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
        {props.attention}
        {!props.attention && waiting > 0 && (
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
        <RecordsMenu
          decisions={props.decisions}
          onDecisions={props.onDecisions}
          knowledge={props.knowledge}
          onKnowledge={props.onKnowledge}
          briefingOpen={props.briefingOpen}
          briefingStatus={props.briefingStatus}
          onBriefing={props.onBriefing}
        />
        <ThemeToggle onToggle={props.onToggleTheme} />
        <Button
          variant="ghost"
          onClick={props.onSettings}
          data-tip="Tracker, verification, appearance and integrations"
        >
          Settings
        </Button>
      </div>
    </Panel>
  );
}
