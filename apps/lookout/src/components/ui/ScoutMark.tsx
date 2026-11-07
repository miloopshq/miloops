/**
 * The Scout mark: an open loop (a 300° ring whose arrowhead closes the gap) around the trail lead dot.
 * Variants reuse the same geometry so the mark doubles as UI glyphs. All strokes use currentColor.
 */
export type MarkVariant = 'mark' | 'action' | 'voice' | 'status' | 'alert';

export type MarkState = 'idle' | 'ok' | 'syncing' | 'error';

export const ARC = 'M25.53 10.5 A11 11 0 1 1 16 5';

export const TIP = 'M20 5 L14.6 1.6 L14.6 8.4 Z';

export function ScoutMark({
  variant = 'mark',
  state = 'ok',
  size = 20,
  className = '',
  title,
}: {
  variant?: MarkVariant;
  state?: MarkState;
  size?: number;
  className?: string;
  title?: string;
}) {
  const sw = size <= 14 ? 3 : 2.4;
  return (
    <svg
      className={`scout-mark mm-${variant} mm-${state} ${className}`}
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {variant === 'status' || variant === 'alert' ? (
        <circle
          cx="16"
          cy="16"
          r="11"
          fill="none"
          stroke="currentColor"
          strokeWidth={sw}
          strokeDasharray={state === 'syncing' ? '5 3.6' : undefined}
        />
      ) : (
        <path d={ARC} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="butt" />
      )}
      {(variant === 'mark' || variant === 'action') && <path d={TIP} fill="currentColor" />}
      {variant === 'action' && <path d="M13 11 L21.5 16 L13 21 Z" fill="currentColor" />}
      {(variant === 'mark' || variant === 'voice') && (
        <circle cx="16" cy="16" r={variant === 'voice' ? 4 : 3.4} fill="currentColor" />
      )}
      {variant === 'status' &&
        (state === 'idle' ? (
          <circle cx="16" cy="16" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        ) : (
          <circle cx="16" cy="16" r="4.2" fill="currentColor" />
        ))}
      {variant === 'alert' && (
        <>
          <rect x="14.4" y="8.5" width="3.2" height="9.5" fill="currentColor" />
          <rect x="14.4" y="20.5" width="3.2" height="3.2" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
