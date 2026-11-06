import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui';

/** A header button that opens a small menu. Closes on an outside click, on Escape, and after choosing an item. */
export function HeaderMenu(props: { label: string; badge?: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      const dismissed = e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node);
      if (dismissed) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="header-menu" ref={ref}>
      <Button variant="ghost" aria-haspopup="menu" aria-expanded={open} on={open} onClick={() => setOpen(!open)}>
        {props.label} {props.badge} <span className="caret">▾</span>
      </Button>
      {open && (
        <div className="header-menu-list" role="menu">
          {props.children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
