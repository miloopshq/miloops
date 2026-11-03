import { Header } from '../features/header';
import { useKnowledge } from '../features/knowledge';
import { useSlackStatus } from '../features/slack';
import type { CommandCenterApi, useBriefing } from '../hooks';
import type { Runtime } from '../lib';

/** The header, wired to the app's mission actions, dialogs and the Slack connection alert. */
export function AppHeader(props: {
  api: CommandCenterApi;
  rt: Runtime;
  repo: string;
  brief: ReturnType<typeof useBriefing>;
  decisionsOpen: boolean;
  onDecisions: () => void;
  onNewMission: () => void;
  onSettings: (focus: 'top' | 'slack') => void;
}) {
  const { api, rt, brief } = props;
  const { snap, actions } = api;
  const [slack] = useSlackStatus(15000);
  const knowledge = useKnowledge();
  const slackAlert =
    slack?.enabled && slack.state === 'auth-error' ? (slack.error ?? 'Slack rejected the tokens') : undefined;
  return (
    <Header
      repo={props.repo}
      snaps={api.allSnaps}
      map={snap?.map}
      activity={api.activity}
      health={api.health}
      onNewMission={props.onNewMission}
      trackerLabel={rt.adapter.label.toLowerCase()}
      onSelectMap={actions.selectMap}
      onToggleMode={() => snap && actions.setMode(snap.map.mode === 'plan-only' ? 'plan+execute' : 'plan-only')}
      onSettings={() => props.onSettings('top')}
      slackAlert={slackAlert}
      onSlack={() => props.onSettings('slack')}
      decisions={api.decisions.length}
      decisionsOpen={props.decisionsOpen}
      onDecisions={props.onDecisions}
      knowledge={knowledge.attention}
      knowledgeOpen={knowledge.open}
      onKnowledge={() => knowledge.setOpen(!knowledge.open)}
      briefingOpen={brief.shown}
      briefingStatus={brief.status}
      onBriefing={() => (brief.shown ? brief.dismiss() : brief.open())}
    />
  );
}
