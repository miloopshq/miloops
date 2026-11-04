import { type DiffMark, NODE_H, NODE_W } from '@miloops-hq/core';

/** What a pending replan does to a node: a strike for cancelled tickets, a tag for the rest, ❄ when frozen. */
export function ReplanMarks({ mark, frozen }: { mark?: DiffMark; frozen?: boolean }) {
  const tag = mark && mark !== 'unchanged' && mark !== 'cancelled' ? mark.toUpperCase() : undefined;
  return (
    <>
      {mark === 'cancelled' && <line className="strike" x1={38} y1={NODE_H / 2} x2={NODE_W - 4} y2={NODE_H / 2} />}
      {tag && (
        <text className="replan-tag" x={42} y={NODE_H - 4}>
          {tag}
        </text>
      )}
      {frozen && (
        <text className="freeze" x={NODE_W - 36} y={NODE_H - 4} textAnchor="end">
          ❄
        </text>
      )}
    </>
  );
}
