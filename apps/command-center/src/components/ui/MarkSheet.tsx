import { BRAND } from '@miloops-hq/core';
import { type MarkVariant, type MarkState, MiloMark } from './MiloMark';

/** Dev page (`?mark-sheet`): the mark and its glyph variants, captured as media/milo-mark.png. */
export function MarkSheet() {
  const glyphs: [MarkVariant, MarkState, string, string][] = [
    ['mark', 'ok', 'Mark', 'Header, onboarding'],
    ['action', 'ok', 'Action', 'Primary buttons: Work next, Launch'],
    ['voice', 'ok', 'Voice', 'MILO lines in the activity log'],
    ['alert', 'ok', 'Alert', 'Waiting on you'],
    ['status', 'ok', 'Status · synced', 'Tracker chip'],
    ['status', 'syncing', 'Status · syncing', 'Write in flight'],
    ['status', 'error', 'Status · error', 'Write failed'],
    ['status', 'idle', 'Status · idle', 'No writes yet'],
  ];
  return (
    <div className="mark-sheet">
      <div className="ms-hero">
        <MiloMark size={168} />
        <div>
          <div className="ms-name">{BRAND.name}</div>
          <div className="mono-label ms-cat">{BRAND.category}</div>
          <div className="ms-milo">
            <MiloMark variant="voice" size={18} /> {BRAND.assistant.name} · {BRAND.assistant.expansion}
          </div>
        </div>
      </div>
      <div className="ms-grid">
        {glyphs.map(([v, st, name, use]) => (
          <div key={name} className={`ms-cell ms-${v} ms-${st}`}>
            <div className="ms-big">
              <MiloMark variant={v} state={st} size={64} />
            </div>
            <div className="ms-small">
              <MiloMark variant={v} state={st} size={14} />
              <MiloMark variant={v} state={st} size={20} />
            </div>
            <b>{name}</b>
            <span className="dim">{use}</span>
          </div>
        ))}
      </div>
      <div className="ms-inline">
        <button className="btn primary">
          <MiloMark variant="action" size={14} /> Work next
        </button>
        <span className="waiting-chip">
          <MiloMark variant="alert" size={14} /> 1 waiting on you
        </span>
        <span className="tracker-chip sync-ok">
          <span className="chip-label">Tracker</span>
          <MiloMark variant="status" state="ok" size={13} className="sync-glyph" /> Local markdown{' '}
          <span className="latency">11ms</span>
        </span>
        <span className="log-row src-system ms-log">
          <span className="t">10:42:07</span>
          <span className="src">
            <MiloMark variant="voice" size={11} /> MILO
          </span>
          <span className="msg">Dispatching claude-12 · #8 Survey background-sync limits</span>
        </span>
      </div>
    </div>
  );
}
