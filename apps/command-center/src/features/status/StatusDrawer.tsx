import type { ActivityState, MapSnapshot } from '@miloops-hq/core';
import { useState } from 'react';
import { StatusPanel } from './StatusPanel';

/** The summary: status counts and type mix, tucked under the map so the map gets the room. A tab slides them up over its bottom edge. */
export function StatusDrawer(props: { snap: MapSnapshot; sessions: ActivityState['sessions'] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={open ? 'status-drawer open' : 'status-drawer'}>
      <button
        type="button"
        className="status-toggle"
        aria-expanded={open}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen(!open)}
      >
        Summary <span className="caret">{open ? '▾' : '▴'}</span>
      </button>
      <StatusPanel snap={props.snap} sessions={props.sessions} />
    </div>
  );
}
