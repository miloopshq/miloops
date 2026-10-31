import { type AuditDecision, decisionStatus } from '@miloops-hq/core';
import { day, hm } from '../../lib';
import { SourceTag } from './SourceTag';

export function DecisionRow(props: {
  d: AuditDecision;
  newDay: boolean;
  mission?: string;
  on: boolean;
  showMission: boolean;
  onClick: () => void;
}) {
  const { d } = props;
  const status = decisionStatus(d);
  return (
    <>
      {props.newDay && <li className="dv-day mono-label">{day(d.decidedAt)}</li>}
      <li className={`dv-row ${props.on ? 'on' : ''} ${status}`}>
        <button onClick={props.onClick}>
          <span className="t">{hm(d.decidedAt)}</span>
          <span className="id">{d.id}</span>
          <SourceTag kind={d.source.kind} />
          {props.showMission && <span className="key">{props.mission}</span>}
          <span className="key tk">{d.ticketKey ?? '—'}</span>
          <span className="sum">
            <span className="q">{d.question}</span>
            <span className="a">{d.summary}</span>
          </span>
          <span className="by">{d.decidedBy}</span>
          <span className={`st ${status}`}>
            {status === 'superseded' ? `→ ${d.supersededBy}` : d.supersedes ? `↺ ${d.supersedes}` : 'active'}
          </span>
        </button>
      </li>
    </>
  );
}
