import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ElementType, type FormEvent, type MouseEvent, type ReactNode, type TextareaHTMLAttributes } from 'react';

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger' | 'urgent';

export function Button({ variant = 'default', size = 'md', on, className, type, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md'; on?: boolean }) {
  return <button type={type ?? 'button'} className={cx('btn', variant !== 'default' && variant, size === 'sm' && 'sm', on && 'on', className)} {...rest} />;
}

/** Framed chip label (`chip`) or plain mono caps caption (`plain`). */
export function Label({ as: Tag = 'span', variant = 'chip', hot, size, className, children, title }: { as?: ElementType; variant?: 'chip' | 'plain'; hot?: boolean; size?: 'sm'; className?: string; children: ReactNode; title?: string }) {
  return (
    <Tag className={cx(variant === 'chip' ? 'chip-label' : 'mono-label', hot && 'hot', size === 'sm' && (variant === 'chip' ? 'sm' : 'xs'), className)} title={title}>
      {children}
    </Tag>
  );
}

/** Count badge. For the arrival pop, render it with `key={n}` so it remounts when the count changes. */
export function Badge({ n, urgent, pop, hideZero }: { n: number; urgent?: boolean; pop?: boolean; hideZero?: boolean }) {
  return (
    <span className={cx('badge', urgent && 'urgent', pop && urgent && 'pop', hideZero && !n && 'zero')}>
      {hideZero && !n ? '' : n}
    </span>
  );
}

/** Small status/source tag. `state` colors it from the nearest `st-*` class. */
export function Pill({ tone, className, children, title }: { tone?: 'state' | 'fill' | 'amber'; className?: string; children: ReactNode; title?: string }) {
  return (
    <span className={cx('pill', tone, className)} title={title}>
      {children}
    </span>
  );
}

/** Zone/part header: a chip label, an optional count, and a right-aligned slot. `sub` is the inline variant inside a body. */
export function SectionHeader({ title, count, right, hot, sub, children, className }: { title?: ReactNode; count?: ReactNode; right?: ReactNode; hot?: boolean; sub?: boolean; children?: ReactNode; className?: string }) {
  return (
    <header className={cx('sec-h', sub && 'sub', className)}>
      {children}
      {title !== undefined && (
        <Label as={sub ? 'h3' : 'h2'} hot={hot}>
          {title}
        </Label>
      )}
      {count}
      {right !== undefined && <span className="sec-h-right">{right}</span>}
    </header>
  );
}

/** Mono caps meta line; falsy parts are dropped, the rest joined with " · ". */
export function Meta({ parts, className, as: Tag = 'div' }: { parts: ReactNode[]; className?: string; as?: ElementType }) {
  const shown = parts.filter((p) => p !== undefined && p !== null && p !== false && p !== '');
  return (
    <Tag className={cx('meta', className)}>
      {shown.map((p, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {p}
        </span>
      ))}
    </Tag>
  );
}

export function Readout({ label, value, layout = 'stack', urgent, title, className }: { label: ReactNode; value: ReactNode; layout?: 'stack' | 'start' | 'inline'; urgent?: boolean; title?: string; className?: string }) {
  return (
    <span className={cx('readout', layout !== 'stack' && layout, urgent && 'urgent', className)} title={title}>
      <span className="mono-label">{label}</span>
      {layout === 'inline' && ' '}
      <b>{value}</b>
    </span>
  );
}

/** HUD-framed surface. `frameless` drops the corner brackets (e.g. a zone embedded in a phone view). */
export function Panel({ as: Tag = 'section', className, style, frameless, children, ...rest }: { as?: ElementType; className?: string; style?: CSSProperties; frameless?: boolean; children: ReactNode; role?: string; 'aria-label'?: string; onClick?: (e: MouseEvent) => void; onSubmit?: (e: FormEvent) => void }) {
  return (
    <Tag className={cx('panel', frameless && 'frameless', className)} style={style} {...rest}>
      {children}
    </Tag>
  );
}

export function Card({ as: Tag = 'div', tone, on, className, children, ...rest }: { as?: ElementType; tone?: 'urgent' | 'inset'; on?: boolean; className?: string; children: ReactNode; onClick?: () => void; onSubmit?: (e: FormEvent) => void; title?: string; disabled?: boolean; type?: string }) {
  return (
    <Tag className={cx('card', tone, on && 'on', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function Field({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('field', className)}>
      {label}
      {children}
    </label>
  );
}

/** Textarea + action button on one aligned row. Enter submits; Shift+Enter adds a line. */
export const InputRow = forwardRef<
  HTMLTextAreaElement,
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onSubmit'> & { value: string; onValueChange: (v: string) => void; onSubmit: (v: string) => void; action?: ReactNode; actionDisabled?: boolean; className?: string }
>(function InputRow({ value, onValueChange, onSubmit, action = 'Send', actionDisabled, className, ...rest }, ref) {
  return (
    <form
      className={cx('input-row', className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSubmit(value);
          }
        }}
        {...rest}
      />
      <Button type="submit" variant="primary" disabled={actionDisabled ?? (rest.disabled || !value.trim())}>
        {action}
      </Button>
    </form>
  );
});

/** Selectable option card (settings, onboarding, mission mode). */
export function Choice({ on, title, sub, disabled, onClick }: { on: boolean; title: ReactNode; sub?: ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <Card as="button" type="button" className="choice" on={on} disabled={disabled} onClick={onClick}>
      <b className="card-title">{title}</b>
      {sub && <span className="c-sub">{sub}</span>}
    </Card>
  );
}
