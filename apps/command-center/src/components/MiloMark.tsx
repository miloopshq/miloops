import { BRAND } from '@miloops-hq/core';

/**
 * The MILO mark: an open loop (a 300° ring whose arrowhead closes the gap) around the operator dot.
 * Variants reuse the same geometry so the mark doubles as UI glyphs. All strokes use currentColor.
 */
export type MarkVariant = 'mark' | 'action' | 'voice' | 'status' | 'alert';
export type MarkState = 'idle' | 'ok' | 'syncing' | 'error';

const ARC = 'M25.53 10.5 A11 11 0 1 1 16 5';
const TIP = 'M20 5 L14.6 1.6 L14.6 8.4 Z';

export function MiloMark({ variant = 'mark', state = 'ok', size = 20, className = '', title }: { variant?: MarkVariant; state?: MarkState; size?: number; className?: string; title?: string }) {
  const sw = size <= 14 ? 3 : 2.4;
  return (
    <svg className={`milo-mark mm-${variant} mm-${state} ${className}`} viewBox="0 0 32 32" width={size} height={size} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {variant === 'status' || variant === 'alert' ? (
        <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth={sw} strokeDasharray={state === 'syncing' ? '5 3.6' : undefined} />
      ) : (
        <path d={ARC} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="butt" />
      )}
      {(variant === 'mark' || variant === 'action') && <path d={TIP} fill="currentColor" />}
      {variant === 'action' && <path d="M13 11 L21.5 16 L13 21 Z" fill="currentColor" />}
      {(variant === 'mark' || variant === 'voice') && <circle cx="16" cy="16" r={variant === 'voice' ? 4 : 3.4} fill="currentColor" />}
      {variant === 'status' && (state === 'idle' ? <circle cx="16" cy="16" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" /> : <circle cx="16" cy="16" r="4.2" fill="currentColor" />)}
      {variant === 'alert' && (
        <>
          <rect x="14.4" y="8.5" width="3.2" height="9.5" fill="currentColor" />
          <rect x="14.4" y="20.5" width="3.2" height="3.2" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

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
          <MiloMark variant="status" state="ok" size={13} className="sync-glyph" /> Local markdown <span className="latency">11ms</span>
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
