import { useEffect, useState, type ReactNode } from 'react';
import { Panel, SectionHeader } from './ui';

/** A fixed zone: title row + scrollable body. Zones never resize with content. `bare` renders only the body (for tabbed hosts). */
export function Zone(props: { title: string; count?: ReactNode; right?: ReactNode; className?: string; children: ReactNode; area?: string; bare?: boolean }) {
  if (props.bare) return <div className={`zone-b ${props.className ?? ''}`}>{props.children}</div>;
  return (
    <Panel className={`zone ${props.className ?? ''}`} style={props.area ? { gridArea: props.area } : undefined}>
      <SectionHeader title={props.title} count={props.count} right={props.right ?? null} />
      <div className="zone-b">{props.children}</div>
    </Panel>
  );
}

export type Breakpoint = 'wide' | 'laptop' | 'mobile';

export function useBreakpoint(): Breakpoint {
  const get = (): Breakpoint => (window.innerWidth >= 1440 ? 'wide' : window.innerWidth >= 1024 ? 'laptop' : 'mobile');
  const [bp, setBp] = useState(get);
  useEffect(() => {
    const on = () => setBp(get());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return bp;
}

/** Simple segmented tabs used by tabbed zones. */
export function Tabs<T extends string>(props: { value: T; onChange: (v: T) => void; items: { id: T; label: string; n?: ReactNode }[]; className?: string }) {
  return (
    <div className={`tabs ${props.className ?? ''}`} role="tablist">
      {props.items.map((t) => (
        <button key={t.id} role="tab" aria-selected={props.value === t.id} className={`tab ${props.value === t.id ? 'on' : ''}`} onClick={() => props.onChange(t.id)}>
          {t.label}
          {t.n !== undefined && <span className="n">{t.n}</span>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function ago(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

/** Elapsed duration as HH:MM:SS. */
export function hms(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
}

export const clock = (n: number) => new Date(n).toTimeString().slice(0, 8);

/** Short duration for readouts: 850ms, 42s, 3m 10s, 2h 05m. */
export function dur(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

export const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
export const usd = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(1)}`;

/** Mini bar chart; `hot` marks a subset of each bar (e.g. external events). */
export function Bars(props: { values: number[]; hot?: number[]; height?: number; className?: string; title?: string }) {
  const h = props.height ?? 16;
  const max = Math.max(1, ...props.values);
  const w = props.values.length * 3;
  return (
    <svg className={`bars ${props.className ?? ''}`} viewBox={`0 0 ${w} ${h}`} width={w} height={h} preserveAspectRatio="none" aria-label={props.title}>
      {props.values.map((v, i) => {
        const bh = v ? Math.max(2, (v / max) * h) : 1;
        const hh = props.hot?.[i] ? Math.max(2, (props.hot[i] / max) * h) : 0;
        return (
          <g key={i}>
            <rect x={i * 3} y={h - bh} width={2} height={bh} className={v ? 'on' : 'off'} />
            {hh > 0 && <rect x={i * 3} y={h - hh} width={2} height={hh} className="hot" />}
          </g>
        );
      })}
    </svg>
  );
}

/** Sparkline (line) over bars, both normalised to their own max. */
export function Spark(props: { line: number[]; bars?: number[]; width?: number; height?: number }) {
  const W = props.width ?? 160;
  const H = props.height ?? 34;
  const n = props.line.length;
  const lmax = Math.max(1, ...props.line);
  const bmax = Math.max(1, ...(props.bars ?? [0]));
  const step = W / Math.max(1, n);
  const pts = props.line.map((v, i) => `${(i + 0.5) * step},${H - 2 - (v / lmax) * (H - 6)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      {props.bars?.map((v, i) => v > 0 && <rect key={i} x={i * step + 1} y={H - (v / bmax) * (H * 0.55)} width={Math.max(1, step - 2)} height={(v / bmax) * (H * 0.55)} className="sp-bar" />)}
      <polyline points={pts} className="sp-line" fill="none" />
    </svg>
  );
}
