import { useState, useEffect } from 'react';

export type Breakpoint = 'wide' | 'laptop' | 'mobile';

export function useBreakpoint(): Breakpoint {
  const get = (): Breakpoint => {
    if (window.innerWidth >= 1440) return 'wide';
    if (window.innerWidth >= 1024) return 'laptop';
    return 'mobile';
  };
  const [bp, setBp] = useState(get);
  useEffect(() => {
    const on = () => setBp(get());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return bp;
}
