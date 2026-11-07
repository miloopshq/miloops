import { BRAND } from '@teamtrail/core';
import { type MarkVariant, type MarkState, ScoutMark } from './ScoutMark';

/** Dev page (`?mark-sheet`): the mark and its glyph variants, captured as media/scout-mark.png. */
export function MarkSheet() {
  const glyphs: [MarkVariant, MarkState, string, string][] = [
    ['mark', 'ok', 'Mark', 'Header, onboarding'],
    ['action', 'ok', 'Action', 'Primary buttons: Work next, Launch'],
    ['voice', 'ok', 'Voice', 'Scout lines in the activity log'],
    ['alert', 'ok', 'Alert', 'Waiting on you'],
    ['status', 'ok', 'Status · synced', 'Tracker chip'],
    ['status', 'syncing', 'Status · syncing', 'Write in flight'],
    ['status', 'error', 'Status · error', 'Write failed'],
    ['status', 'idle', 'Status · idle', 'No writes yet'],
  ];
  return (
    <div className="mark-sheet">
      <div className="ms-hero">
        <ScoutMark size={168} />
        <div>
          <div className="ms-name">{BRAND.name}</div>
          <div className="mono-label ms-cat">{BRAND.category}</div>
          <div className="ms-scout">
            <ScoutMark variant="voice" size={18} /> {BRAND.assistant.name}
          </div>
        </div>
      </div>
      <div className="ms-grid">
        {glyphs.map(([v, st, name, use]) => (
          <div key={name} className={`ms-cell ms-${v} ms-${st}`}>
            <div className="ms-big">
              <ScoutMark variant={v} state={st} size={64} />
            </div>
            <div className="ms-small">
              <ScoutMark variant={v} state={st} size={14} />
              <ScoutMark variant={v} state={st} size={20} />
            </div>
            <b>{name}</b>
            <span className="dim">{use}</span>
          </div>
        ))}
      </div>
      <div className="ms-inline">
        <button className="btn primary">
          <ScoutMark variant="action" size={14} /> Work next
        </button>
        <span className="waiting-chip">
          <ScoutMark variant="alert" size={14} /> 1 waiting on you
        </span>
        <span className="tracker-chip sync-ok">
          <span className="chip-label">Tracker</span>
          <ScoutMark variant="status" state="ok" size={13} className="sync-glyph" /> Local markdown{' '}
          <span className="latency">11ms</span>
        </span>
        <span className="log-row src-system ms-log">
          <span className="t">10:42:07</span>
          <span className="src">
            <ScoutMark variant="voice" size={11} /> Scout
          </span>
          <span className="msg">Dispatching claude-12 · #8 Survey background-sync limits</span>
        </span>
      </div>
    </div>
  );
}
