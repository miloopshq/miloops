import { type MapSnapshot, type MapDoc, type ActivityState, trailProgress } from '@teamtrail/core';
import { useState, useRef, useEffect } from 'react';
import { Badge, Label } from '../../components/ui';

export function TrailSwitcher(props: {
  snaps: Record<string, MapSnapshot>;
  map?: MapDoc;
  activity: ActivityState;
  onSelectMap: (id: string) => void;
  onNewTrail: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  const trails = Object.values(props.snaps).sort((a, b) => b.map.createdAt - a.map.createdAt);
  const waitingIn = (id: string) => props.activity.pending.filter((q) => q.mapId === id).length;
  const otherWaiting = props.activity.pending.filter((q) => q.mapId !== props.map?.id).length;
  return (
    <div className="trail-switcher" ref={ref}>
      <button
        className="trail-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-tip="Switch trail, or start a new one"
      >
        <span className="trail-title">{props.map ? `${props.map.key} ${props.map.title}` : 'No trail'}</span>
        {otherWaiting > 0 && <Badge n={otherWaiting} urgent />}
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="trail-menu" role="menu">
          <Label variant="plain" className="menu-h">
            Trails
          </Label>
          {trails.map((s) => {
            const p = trailProgress(s);
            const w = waitingIn(s.map.id);
            return (
              <button
                key={s.map.id}
                role="menuitem"
                className={`trail-item ${s.map.id === props.map?.id ? 'on' : ''}`}
                onClick={() => {
                  props.onSelectMap(s.map.id);
                  setOpen(false);
                }}
              >
                <span className="key">{s.map.key}</span>
                <span className="mi-title">{s.map.title}</span>
                <span className="mi-progress">
                  {p.decided}/{p.total}
                </span>
                <Badge n={w} urgent={!!w} hideZero />
              </button>
            );
          })}
          <button
            role="menuitem"
            className="trail-item new"
            onClick={() => {
              setOpen(false);
              props.onNewTrail();
            }}
          >
            + New trail
          </button>
        </div>
      )}
    </div>
  );
}
