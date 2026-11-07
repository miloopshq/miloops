import type { BriefingStatus } from '../../hooks';
import { HeaderMenu } from './HeaderMenu';

const BRIEFING_TITLE: Record<BriefingStatus, string> = {
  new: 'While you were away: a new briefing from MILO',
  seen: 'Reopen the last briefing',
  none: 'No briefing yet. MILO briefs you when you come back after being away.',
};

/** The views you open now and then, grouped behind one header button: briefing, knowledge and decisions. */
export function RecordsMenu(props: {
  decisions: number;
  onDecisions: () => void;
  knowledge: number;
  onKnowledge: () => void;
  briefingOpen: boolean;
  briefingStatus: BriefingStatus;
  onBriefing: () => void;
}) {
  const isNew = props.briefingStatus === 'new';
  return (
    <HeaderMenu
      label="Records"
      badge={
        <>
          {props.knowledge > 0 && <span className="n hot">{props.knowledge}</span>}
          {isNew && <span className="new-dot" aria-label="new briefing" />}
        </>
      }
    >
      {(close) => (
        <>
          <button
            role="menuitem"
            className="header-menu-item"
            disabled={props.briefingStatus === 'none' && !props.briefingOpen}
            title={BRIEFING_TITLE[props.briefingStatus]}
            onClick={() => {
              close();
              props.onBriefing();
            }}
          >
            <span>Briefing</span>
            {isNew && <span className="new-dot" aria-label="new" />}
          </button>
          <button
            role="menuitem"
            className="header-menu-item knowledge-btn"
            title="What agents know about this codebase and product. Review suggestions, flags and stale entries"
            onClick={() => {
              close();
              props.onKnowledge();
            }}
          >
            <span>Knowledge</span>
            {props.knowledge > 0 && <span className="n hot">{props.knowledge}</span>}
          </button>
          <button
            role="menuitem"
            className="header-menu-item decisions-btn"
            title="Every decision across your missions, with its reasoning. Search, filter and export"
            onClick={() => {
              close();
              props.onDecisions();
            }}
          >
            <span>Decisions</span>
            <span className="n">{props.decisions}</span>
          </button>
        </>
      )}
    </HeaderMenu>
  );
}
