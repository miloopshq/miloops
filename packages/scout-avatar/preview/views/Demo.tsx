import { useEffect, useState } from 'react';
import { ScoutAvatar, type ScoutStyleId } from '../../src/scout';
import { SCRIPT } from '../content';

export function Demo({ variant }: { variant: ScoutStyleId }) {
  const [i, setI] = useState(0);
  const step = SCRIPT[i % SCRIPT.length];
  useEffect(() => {
    const id = setTimeout(() => setI((n) => n + 1), step.ms);
    return () => clearTimeout(id);
  }, [i, step.ms]);
  const loop = Math.floor(i / SCRIPT.length);
  const log = SCRIPT.slice(0, (i % SCRIPT.length) + 1).filter((s) => s.log);
  return (
    <div className="sheet demo" data-capture="demo" data-step={i % SCRIPT.length} data-loop={loop}>
      <ScoutAvatar variant={variant} size="lg" state={step.state} speaking={step.speaking} />
      <div className="pane tall">
        <div className="pane-h">
          <span className={`chip ${step.state === 'alert' ? 'hot' : ''}`}>Inbox</span>
          <span className="dim">comms with Scout</span>
        </div>
        <div className="msgs pad">
          {log.map((s, k) => (
            <div key={k} className={`msg ${s.hot ? 'hot' : ''}`}>
              <div className="meta">
                <ScoutAvatar variant={variant} size="xs" state={s.hot ? 'alert' : 'idle'} /> Scout · 10:4{k}
              </div>
              {s.log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
