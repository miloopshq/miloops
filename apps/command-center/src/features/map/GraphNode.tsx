import { attention, type LaidOutNode, NODE_H, NODE_W, type SessionInfo } from '@miloops-hq/core';
import { type Selection, STATE_LABEL, TYPE_CODE } from '../../lib';
import { wrap } from './wrap';

/** One ticket on the graph: state styling, type badge, key, title, HITL/AFK tag and the live session line. */
export function GraphNode({
  n,
  session: s,
  stalled,
  flag,
  selected,
  onSelect,
}: {
  n: LaidOutNode;
  session?: SessionInfo;
  /** Claimed by an agent whose lease is about to run out or ran out. */
  stalled?: boolean;
  /** Most serious open PR/CI mismatch flag. */
  flag?: 'alert' | 'warn';
  selected: boolean;
  onSelect: (s: Selection) => void;
}) {
  const t = n.ticket;
  const lines = wrap(t.title, 22);
  const hitl = attention(t) === 'hitl';
  const waiting = !!s?.waitingOn;
  return (
    <g
      className={`node st-${n.state} ${hitl ? 'hitl' : 'afk'} ${selected ? 'sel' : ''} ${s ? 'live' : ''} ${waiting ? 'waiting' : ''} ${stalled && !waiting ? 'stalled' : ''}`}
      style={{ transform: `translate(${n.x}px, ${n.y}px)` }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: 'ticket', id: t.id });
      }}
    >
      {n.state === 'frontier' && <rect className="halo" x={-4} y={-4} width={NODE_W + 8} height={NODE_H + 8} />}
      {waiting && <rect className="alarm" x={-6} y={-6} width={NODE_W + 12} height={NODE_H + 12} />}
      <rect className="body" width={NODE_W} height={NODE_H} />
      {(n.state === 'blocked' || n.state === 'parked') && (
        <rect width={NODE_W} height={NODE_H} fill="url(#hatch-dim)" />
      )}
      {n.state === 'out-of-scope' && <rect width={NODE_W} height={NODE_H} fill="url(#hatch-oos)" />}
      <rect className="badge" width={34} height={NODE_H} />
      <text className="badge-t" x={17} y={NODE_H / 2 + 4} textAnchor="middle">
        {TYPE_CODE[t.type]}
      </text>
      <text className="key" x={42} y={14}>
        {t.key}
      </text>
      <text className="state" x={NODE_W - 6} y={14} textAnchor="end">
        {waiting
          ? '▲ WAITING ON YOU'
          : stalled
            ? `◇ STALLED · ${t.assignee}`
            : n.state === 'claimed'
              ? `◆ ${t.assignee}`
              : STATE_LABEL[n.state].toUpperCase()}
      </text>
      {lines.map((l, i) => (
        <text key={i} className="title" x={42} y={30 + i * 13}>
          {l}
        </text>
      ))}
      <g className={`att ${hitl ? 'hitl' : 'afk'}`} transform={`translate(${NODE_W - 30} ${NODE_H - 13})`}>
        <rect width={26} height={10} />
        <text x={13} y={8} textAnchor="middle">
          {hitl ? 'HITL' : 'AFK'}
        </text>
      </g>
      {flag && <circle className={`pr-flag-dot ${flag}`} cx={NODE_W - 2} cy={2} r={4} />}
      {s && !waiting && (
        <text className="live-tag" x={NODE_W} y={NODE_H + 13} textAnchor="end">
          {s.agent} · {s.mode.toUpperCase()} {s.step}/{s.total} {s.stepLabel.toUpperCase()}
        </text>
      )}
    </g>
  );
}
