import { type MapSnapshot, type SessionInfo, layout, NODE_W, NODE_H, attention } from '@miloops-hq/core';
import { useRef, useState, useEffect, useMemo } from 'react';
import type { Selection } from '../../hooks';
import { TYPE_CODE, STATE_LABEL } from '../../lib';
import { wrap } from './wrap';

export const PAD = 32;

export type View = { k: number; x: number; y: number };

/** Decision graph. Fits itself to the zone; drag/pinch/wheel to pan and zoom. */
export function MapGraph(props: {
  snap: MapSnapshot;
  sessions: SessionInfo[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  /** Smallest zoom the initial fit may use; keeps text readable on phones. */
  minFit?: number;
}) {
  const { snap, selection, onSelect } = props;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const L = useMemo(() => {
    const lr = layout(snap.tickets, 'LR', snap.map.mode);
    const tb = layout(snap.tickets, 'TB', snap.map.mode);
    const fit = (l: typeof lr) => Math.min(size.w / (l.width + PAD * 2), size.h / (l.height + PAD * 2 + 16));
    return fit(lr) >= fit(tb) ? lr : tb;
  }, [snap.tickets, snap.map.mode, size.w, size.h]);
  const W = L.width + PAD * 2;
  const H = L.height + PAD * 2 + 16;

  const fitView = (): View => {
    const k = Math.min(1.25, Math.max(props.minFit ?? 0, Math.min(size.w / W, size.h / H)));
    return { k, x: Math.max(0, (size.w - W * k) / 2), y: Math.max(0, (size.h - H * k) / 2) };
  };
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const touched = useRef(false);
  useEffect(() => {
    touched.current = false;
  }, [snap.map.id]);
  useEffect(() => {
    if (!touched.current && size.w) setView(fitView());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, W, H, snap.map.id]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ view: View; dist: number; mid: { x: number; y: number }; moved: boolean } | null>(null);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const startGesture = () => {
    const pts = [...pointers.current.values()];
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { view, dist, mid, moved: gesture.current?.moved ?? false };
  };
  const zoomAt = (v: View, k: number, p: { x: number; y: number }): View => {
    const nk = Math.min(3, Math.max(0.2, k));
    return { k: nk, x: p.x - ((p.x - v.x) * nk) / v.k, y: p.y - ((p.y - v.y) * nk) / v.k };
  };

  const live = new Map(props.sessions.filter((s) => s.status === 'running' && s.ticketId).map((s) => [s.ticketId!, s]));
  const selId = selection?.kind === 'ticket' ? selection.id : undefined;

  return (
    <div
      className="graph-box"
      ref={box}
      onPointerDown={(e) => {
        pointers.current.set(e.pointerId, local(e));
        if (pointers.current.size === 1) gesture.current = null;
        startGesture();
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId) || !gesture.current) return;
        pointers.current.set(e.pointerId, local(e));
        const g = gesture.current;
        const pts = [...pointers.current.values()];
        if (pts.length > 1) {
          const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          const z = zoomAt(g.view, (g.view.k * dist) / (g.dist || dist), g.mid);
          setView({ ...z, x: z.x + mid.x - g.mid.x, y: z.y + mid.y - g.mid.y });
          g.moved = true;
        } else {
          const dx = pts[0].x - g.mid.x,
            dy = pts[0].y - g.mid.y;
          if (!g.moved && Math.hypot(dx, dy) < 5) return;
          if (!g.moved) box.current?.setPointerCapture(e.pointerId);
          g.moved = true;
          setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
        }
        touched.current = true;
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size) startGesture();
      }}
      onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
      onWheel={(e) => {
        touched.current = true;
        setView((v) => zoomAt(v, v.k * Math.exp(-e.deltaY * 0.0015), local(e)));
      }}
      onClickCapture={(e) => {
        if (gesture.current?.moved) {
          e.stopPropagation();
          gesture.current = null;
        }
      }}
    >
      <svg className="graph" width={size.w} height={size.h} onClick={() => onSelect(null)}>
        <defs>
          <pattern id="hatch-oos" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="rgba(255,77,66,0.05)" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,77,66,0.45)" strokeWidth="2.2" />
          </pattern>
          <pattern id="hatch-dim" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(120,160,170,0.12)" strokeWidth="1.5" />
          </pattern>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 1L9 5L0 9" fill="none" stroke="context-stroke" strokeWidth="1.4" />
          </marker>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g transform={`translate(${PAD} ${PAD})`}>
            {L.nodes.some((n) => n.state === 'out-of-scope') && (
              <g className="quarantine">
                <rect
                  x={-20}
                  y={L.quarantineY - 30}
                  width={L.width + 40}
                  height={L.quarantineH + 18}
                  fill="url(#hatch-oos)"
                />
                <text x={-12} y={L.quarantineY - 14}>
                  OUT OF SCOPE // QUARANTINE
                </text>
              </g>
            )}

            {L.edges.map(({ from, to }) => {
              const open = from.ticket.state === 'open';
              let d: string;
              if (L.direction === 'LR') {
                const x1 = from.x + NODE_W,
                  y1 = from.y + NODE_H / 2,
                  x2 = to.x - 4,
                  y2 = to.y + NODE_H / 2;
                const mx = (x1 + x2) / 2;
                d = `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
              } else {
                const x1 = from.x + NODE_W / 2,
                  y1 = from.y + NODE_H,
                  x2 = to.x + NODE_W / 2,
                  y2 = to.y - 4;
                const my = (y1 + y2) / 2;
                d = `M${x1} ${y1}C${x1} ${my} ${x2} ${my} ${x2} ${y2}`;
              }
              return (
                <path
                  key={`${from.ticket.id}-${to.ticket.id}`}
                  className={`edge ${open ? 'edge-open' : 'edge-done'}`}
                  d={d}
                  markerEnd="url(#arrow)"
                />
              );
            })}

            {L.nodes.map((n) => {
              const t = n.ticket;
              const s = live.get(t.id);
              const lines = wrap(t.title, 22);
              const hitl = attention(t) === 'hitl';
              const waiting = !!s?.waitingOn;
              return (
                <g
                  key={t.id}
                  className={`node st-${n.state} ${hitl ? 'hitl' : 'afk'} ${selId === t.id ? 'sel' : ''} ${s ? 'live' : ''} ${waiting ? 'waiting' : ''}`}
                  style={{ transform: `translate(${n.x}px, ${n.y}px)` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect({ kind: 'ticket', id: t.id });
                  }}
                >
                  {n.state === 'frontier' && (
                    <rect className="halo" x={-4} y={-4} width={NODE_W + 8} height={NODE_H + 8} />
                  )}
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
                  {s && !waiting && (
                    <text className="live-tag" x={NODE_W} y={NODE_H + 13} textAnchor="end">
                      {s.agent} · {s.mode.toUpperCase()} {s.step}/{s.total} {s.stepLabel.toUpperCase()}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      <button
        className="btn sm fit-btn"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          touched.current = false;
          setView(fitView());
        }}
      >
        Fit
      </button>
    </div>
  );
}
